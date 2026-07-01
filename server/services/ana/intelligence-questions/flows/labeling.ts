/**
 * Drug / Device Labeling flow — AnA Intelligence Questions.
 *
 * Covers prescription drug labeling (USPI per 21 CFR 201.56-57 PLR format),
 * OTC Drug Facts (21 CFR 201.66), device labeling (21 CFR 801),
 * biosimilar-specific labeling (BPCI Act), and patient-facing materials
 * (Medication Guides per 21 CFR 208, Instructions for Use).
 *
 * 18 question nodes · 80+ fields · 7 sections · 12+ issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/labeling
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createLabelingFlow(): FlowDefinition {
  return {
    id: 'labeling-v1',
    category: 'labeling',
    name: 'Drug / Device Labeling',
    description:
      'Comprehensive labeling questionnaire for prescription drugs (USPI), OTC products, biologics, biosimilars, and medical devices. Aligns with 21 CFR 201/801, PLR format, and SPL submission requirements.',
    clientTypes: [],
    estimatedMinutes: 40,
    entryNode: 'product_regulatory_context',

    /* ================================================================
     *  SECTIONS
     * ================================================================ */
    sections: [
      {
        id: 'product_regulatory_context',
        label: 'Product & Regulatory Context',
        nodeIds: ['product_regulatory_context', 'labeling_format_selection'],
      },
      {
        id: 'prescribing_info_structure',
        label: 'Prescribing Information Structure',
        nodeIds: ['plr_highlights', 'full_prescribing_info_toc'],
      },
      {
        id: 'clinical_pharmacology',
        label: 'Clinical Pharmacology',
        nodeIds: ['mechanism_and_pk', 'drug_interaction_studies'],
      },
      {
        id: 'indications_usage',
        label: 'Indications & Usage',
        nodeIds: ['indications_and_usage', 'dosage_and_administration'],
      },
      {
        id: 'warnings_precautions',
        label: 'Warnings & Precautions',
        nodeIds: [
          'boxed_warning_assessment',
          'warnings_precautions_detail',
          'adverse_reactions',
          'contraindications',
        ],
      },
      {
        id: 'patient_labeling',
        label: 'Patient Labeling',
        nodeIds: [
          'specific_populations',
          'patient_counseling_info',
          'medication_guide_assessment',
          'otc_drug_facts',
        ],
      },
      {
        id: 'device_labeling',
        label: 'Device-Specific Labeling',
        nodeIds: ['device_labeling_801', 'device_ifu_content', 'device_udi_symbols'],
      },
    ],

    /* ================================================================
     *  NODES
     * ================================================================ */
    nodes: [
      /* ─────────────────────────────────────────────────────────────
       *  SECTION 1 — Product & Regulatory Context
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'product_regulatory_context',
        section: 'Product & Regulatory Context',
        question:
          'Let\'s start by identifying the product and its regulatory pathway so we can tailor the labeling questionnaire.',
        guidance:
          'The labeling format depends on the product type and regulatory classification. Prescription drugs follow the PLR format (21 CFR 201.56-57), OTC drugs use the Drug Facts format (21 CFR 201.66), biologics follow PLR with additional biosimilar considerations under the BPCI Act, and devices follow 21 CFR 801.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'product_name',
            label: 'Product Name (Proprietary / Trade Name)',
            type: 'text',
            placeholder: 'e.g., Keytruda, Eliquis, Accu-Chek Guide',
            required: true,
          },
          {
            id: 'nonproprietary_name',
            label: 'Established / Nonproprietary Name (INN/USAN)',
            type: 'text',
            placeholder: 'e.g., pembrolizumab, apixaban',
            helpText: 'Required for drugs and biologics; enter N/A for devices.',
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'rx_drug', label: 'Prescription Drug (NDA)' },
              { value: 'otc_drug', label: 'OTC Drug (NDA/ANDA/OTC Monograph)' },
              { value: 'biologic', label: 'Biologic (BLA)' },
              { value: 'biosimilar', label: 'Biosimilar (351(k) BLA)', description: 'Includes interchangeable biosimilars' },
              { value: 'medical_device', label: 'Medical Device (510(k)/PMA/De Novo)' },
              { value: 'ivd', label: 'In Vitro Diagnostic Device' },
              { value: 'combination', label: 'Drug-Device Combination Product' },
            ],
          },
          {
            id: 'application_number',
            label: 'Application Number (NDA / BLA / 510(k) / PMA)',
            type: 'text',
            placeholder: 'e.g., NDA 210259, BLA 125514, K201234',
            helpText: 'Leave blank if not yet assigned.',
          },
          {
            id: 'submission_type',
            label: 'Is this an initial labeling submission or a supplement / revision?',
            type: 'select',
            required: true,
            options: [
              { value: 'initial', label: 'Initial Labeling (Original Application)' },
              { value: 'supplement', label: 'Labeling Supplement (sNDA/sBLA)' },
              { value: 'annual_report', label: 'Annual Report Change' },
              { value: 'cbefn', label: 'Changes Being Effected (CBE/CBE-30)' },
              { value: 'revision', label: 'Device Labeling Revision' },
            ],
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area / Indication Category',
            type: 'select',
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'cardiology', label: 'Cardiovascular' },
              { value: 'neurology', label: 'Neurology / Psychiatry' },
              { value: 'immunology', label: 'Immunology / Rheumatology' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'endocrinology', label: 'Endocrinology / Metabolic' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'gastroenterology', label: 'Gastroenterology' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'rems_required',
            label: 'Is a Risk Evaluation and Mitigation Strategy (REMS) required?',
            type: 'yes_no',
            helpText: 'REMS programs may require Medication Guides, Communication Plans, ETASU, or other elements.',
          },
          {
            id: 'reference_product',
            label: 'Reference Product (for Biosimilar)',
            type: 'text',
            placeholder: 'e.g., Humira (adalimumab)',
            helpText: 'Required under BPCI Act 351(k). Include brand name and INN of the reference biologic.',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'biosimilar' },
          },
          {
            id: 'interchangeable_designation',
            label: 'Has interchangeability been demonstrated?',
            type: 'yes_no',
            helpText: 'Interchangeable biosimilars carry specific labeling language per FDA guidance.',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'biosimilar' },
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'in', value: ['medical_device', 'ivd'] },
            goto: 'device_labeling_801',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'otc_drug' },
            goto: 'otc_drug_facts',
          },
        ],
        defaultNext: 'labeling_format_selection',
      },

      /* ── Node 2: Labeling Format Selection ──────────────────────── */
      {
        id: 'labeling_format_selection',
        section: 'Product & Regulatory Context',
        question:
          'Which labeling format and submission standard will you use?',
        guidance:
          'All prescription drug and biologic labeling must follow the Physician Labeling Rule (PLR) format per 21 CFR 201.56(d) and 201.57. Labeling content is submitted electronically in Structured Product Labeling (SPL) XML format to the FDA\'s DailyMed system. Biosimilar labeling follows the same PLR format with modifications per FDA\'s "Labeling for Biosimilar Products" guidance.',
        fields: [
          {
            id: 'plr_format_confirmed',
            label: 'Confirm PLR format will be used (21 CFR 201.56-57)',
            type: 'yes_no',
            required: true,
            helpText: 'The PLR format is mandatory for all NDA/BLA labeling approved after June 30, 2006.',
          },
          {
            id: 'spl_submission_planned',
            label: 'Will labeling be submitted in SPL XML format?',
            type: 'yes_no',
            required: true,
            helpText: 'Electronic SPL submission to FDA DailyMed is required. See FDA SPL guidance and HL7 SPL standard.',
          },
          {
            id: 'spl_tool',
            label: 'SPL authoring tool',
            type: 'select',
            options: [
              { value: 'fda_spl_editor', label: 'FDA SPL Editor' },
              { value: 'globalsubmit', label: 'GlobalSubmit' },
              { value: 'docubridge', label: 'DocuBridge SPL Module' },
              { value: 'custom', label: 'Custom / In-house SPL tool' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'labeling_languages',
            label: 'Labeling languages',
            type: 'multi_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'spanish', label: 'Spanish' },
              { value: 'french', label: 'French (Canadian market)' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'FDA requires English. Additional languages may be needed for territories or global filings.',
          },
          {
            id: 'previous_labeling_version',
            label: 'Previous labeling version number (if supplement)',
            type: 'text',
            placeholder: 'e.g., Version 12, Rev. 3',
            visibleWhen: { field: 'submission_type', operator: 'in', value: ['supplement', 'cbefn', 'annual_report'] },
          },
        ],
        issueChecks: [
          {
            id: 'no_spl_submission',
            condition: { field: 'spl_submission_planned', operator: 'eq', value: 'no' },
            severity: 'critical',
            title: 'SPL Electronic Submission Required',
            message:
              'FDA requires all labeling to be submitted electronically in Structured Product Labeling (SPL) XML format. Failure to submit in SPL format will result in a Refuse to File determination.',
            reference: '21 CFR 314.50(l)(1); FDA Guidance: Providing Regulatory Submissions in Electronic Format — Content of Labeling',
          },
        ],
        defaultNext: 'plr_highlights',
      },

      /* ─────────────────────────────────────────────────────────────
       *  SECTION 2 — Prescribing Information Structure
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'plr_highlights',
        section: 'Prescribing Information Structure',
        question:
          'Let\'s build the Highlights of Prescribing Information section — the concise summary that opens the USPI.',
        guidance:
          'Per 21 CFR 201.57(a), Highlights must include: Boxed Warning (if any), Recent Major Changes, Indications and Usage, Dosage and Administration, Dosage Forms and Strengths, Contraindications, Warnings and Precautions, and Adverse Reactions summaries. It must also include the initial U.S. approval year and a toll-free number for adverse event reporting.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'initial_us_approval_year',
            label: 'Initial U.S. Approval Year',
            type: 'number',
            required: true,
            placeholder: 'e.g., 2014',
            helpText: 'The year the drug was first approved in the United States.',
            validation: { min: 1900, max: 2030 },
          },
          {
            id: 'recent_major_changes',
            label: 'Recent Major Changes (within last 12 months)',
            type: 'textarea',
            placeholder: 'List each section changed and the month/year, e.g.:\n- Indications and Usage (1.1): 03/2025\n- Warnings and Precautions (5.2): 06/2025',
            helpText: 'Per 21 CFR 201.57(a)(4), list sections with substantive labeling changes within the past year. Include section number and date of change.',
          },
          {
            id: 'highlights_limitations',
            label: 'Limitations Statement',
            type: 'textarea',
            helpText: 'Standard text: "These highlights do not include all the information needed to use [PRODUCT] safely and effectively. See full prescribing information for [PRODUCT]."',
            placeholder: 'Customize if needed, or leave blank for standard language.',
          },
          {
            id: 'dosage_forms_summary',
            label: 'Dosage Forms and Strengths (for Highlights)',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Tablets: 5 mg, 10 mg, 20 mg\nInjection: 100 mg/mL in single-dose vials',
          },
          {
            id: 'adverse_event_reporting_number',
            label: 'Toll-Free Adverse Event Reporting Number',
            type: 'text',
            required: true,
            placeholder: 'e.g., 1-800-XXX-XXXX',
            helpText: 'Required in Highlights per 21 CFR 201.57(a)(11). Must also reference MedWatch (1-800-FDA-1088).',
          },
        ],
        defaultNext: 'full_prescribing_info_toc',
      },

      /* ── Node 4: Full Prescribing Info Table of Contents ─────────── */
      {
        id: 'full_prescribing_info_toc',
        section: 'Prescribing Information Structure',
        question:
          'Which sections of Full Prescribing Information (FPI) will the labeling include?',
        guidance:
          'Per 21 CFR 201.57(c), FPI sections are numbered 1 through 17. Not all sections are required for every product — include only those relevant. Sections 9 (Drug Abuse and Dependence) and 16 (How Supplied / Storage and Handling) are commonly included. Section 11 (Description) and Section 12 (Clinical Pharmacology) are always required.',
        fields: [
          {
            id: 'fpi_sections_included',
            label: 'FPI Sections to Include',
            type: 'multi_select',
            required: true,
            options: [
              { value: '1', label: '1 — Indications and Usage' },
              { value: '2', label: '2 — Dosage and Administration' },
              { value: '3', label: '3 — Dosage Forms and Strengths' },
              { value: '4', label: '4 — Contraindications' },
              { value: '5', label: '5 — Warnings and Precautions' },
              { value: '6', label: '6 — Adverse Reactions' },
              { value: '7', label: '7 — Drug Interactions' },
              { value: '8', label: '8 — Use in Specific Populations' },
              { value: '9', label: '9 — Drug Abuse and Dependence' },
              { value: '10', label: '10 — Overdosage' },
              { value: '11', label: '11 — Description' },
              { value: '12', label: '12 — Clinical Pharmacology' },
              { value: '13', label: '13 — Nonclinical Toxicology' },
              { value: '14', label: '14 — Clinical Studies' },
              { value: '15', label: '15 — References' },
              { value: '16', label: '16 — How Supplied / Storage and Handling' },
              { value: '17', label: '17 — Patient Counseling Information' },
            ],
          },
          {
            id: 'fpi_numbering_convention',
            label: 'Subsection numbering convention',
            type: 'select',
            options: [
              { value: 'standard_plr', label: 'Standard PLR Numbering (1.1, 5.1, etc.)' },
              { value: 'custom', label: 'Custom Subsection Numbering' },
            ],
            helpText: 'Standard PLR numbering is strongly recommended per 21 CFR 201.57(d).',
          },
        ],
        defaultNext: 'mechanism_and_pk',
      },

      /* ─────────────────────────────────────────────────────────────
       *  SECTION 3 — Clinical Pharmacology
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'mechanism_and_pk',
        section: 'Clinical Pharmacology',
        question:
          'Describe the mechanism of action and key pharmacokinetic parameters for the Clinical Pharmacology section (Section 12).',
        guidance:
          'Per 21 CFR 201.57(c)(12), the Clinical Pharmacology section must include: (i) Mechanism of Action, (ii) Pharmacodynamics, and (iii) Pharmacokinetics (absorption, distribution, metabolism, elimination). Include relevant parameters: Cmax, Tmax, AUC, t½, bioavailability, protein binding, and clearance.',
        fields: [
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the known or proposed mechanism by which the drug produces its pharmacological effect.',
          },
          {
            id: 'pharmacodynamics_summary',
            label: 'Pharmacodynamics Summary',
            type: 'textarea',
            placeholder: 'Include exposure-response relationships, QTc prolongation data, or other PD effects.',
          },
          {
            id: 'absorption_bioavailability',
            label: 'Absorption / Bioavailability',
            type: 'textarea',
            placeholder: 'e.g., Oral bioavailability ~50%; Tmax 1-2 hours; food effect: AUC increased 20% with high-fat meal.',
          },
          {
            id: 'distribution_protein_binding',
            label: 'Distribution / Protein Binding',
            type: 'textarea',
            placeholder: 'e.g., Vd = 70 L; 95% bound to plasma proteins (primarily albumin).',
          },
          {
            id: 'metabolism_enzymes',
            label: 'Metabolism / Enzymes Involved',
            type: 'textarea',
            placeholder: 'e.g., Primarily metabolized by CYP3A4; minor contribution from CYP2D6.',
          },
          {
            id: 'elimination_half_life',
            label: 'Elimination / Half-Life',
            type: 'textarea',
            placeholder: 'e.g., t½ = 12 hours; ~80% excreted renally (60% unchanged); 15% in feces.',
          },
          {
            id: 'special_pk_populations',
            label: 'PK in Special Populations (hepatic/renal impairment, age, weight)',
            type: 'textarea',
            placeholder: 'Summarize PK differences in hepatic/renal impairment, elderly, pediatric, obese patients.',
          },
        ],
        defaultNext: 'drug_interaction_studies',
      },

      /* ── Node 6: Drug Interaction Studies ───────────────────────── */
      {
        id: 'drug_interaction_studies',
        section: 'Clinical Pharmacology',
        question:
          'What drug-drug interaction studies have been conducted?',
        guidance:
          'Per 21 CFR 201.57(c)(7), the Drug Interactions section must describe clinically significant interactions. Include both clinical DDI studies and in-vitro assessments (CYP inhibition/induction, transporter interactions). Reference FDA DDI guidance (2020) for study expectations.',
        fields: [
          {
            id: 'ddi_studies_conducted',
            label: 'Have dedicated DDI studies been conducted?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cyp_inhibition_profile',
            label: 'CYP Inhibition / Induction Profile',
            type: 'textarea',
            placeholder: 'e.g., In vitro: inhibits CYP2D6 (IC50 = 5 µM); no clinically significant inhibition of CYP1A2, CYP2C9, CYP2C19, CYP3A4.',
          },
          {
            id: 'transporter_interactions',
            label: 'Transporter Interactions (P-gp, BCRP, OATP, etc.)',
            type: 'textarea',
            placeholder: 'e.g., Substrate of P-gp and BCRP. Inhibits OATP1B1 at clinically relevant concentrations.',
          },
          {
            id: 'clinically_significant_ddis',
            label: 'Clinically Significant Drug Interactions',
            type: 'textarea',
            placeholder: 'List drugs/drug classes with clinically meaningful interactions and recommended actions (dose adjustment, avoidance, monitoring).',
          },
          {
            id: 'food_effect',
            label: 'Food Effect',
            type: 'textarea',
            placeholder: 'Describe the effect of food on absorption. Include recommendations for administration with/without food.',
          },
        ],
        issueChecks: [
          {
            id: 'no_ddi_studies',
            condition: { field: 'ddi_studies_conducted', operator: 'eq', value: 'no' },
            severity: 'warning',
            title: 'No Dedicated DDI Studies Conducted',
            message:
              'FDA expects dedicated drug-drug interaction studies for most NDA/BLA products. Absence of DDI data may result in an Information Request or labeling deficiency. Consider in-vitro CYP/transporter assessments at minimum.',
            reference: 'FDA Guidance: In Vitro Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions (January 2020)',
          },
        ],
        defaultNext: 'indications_and_usage',
      },

      /* ─────────────────────────────────────────────────────────────
       *  SECTION 4 — Indications & Usage
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'indications_and_usage',
        section: 'Indications & Usage',
        question:
          'Define the Indications and Usage section — this is the core of the labeling.',
        guidance:
          'Per 21 CFR 201.57(c)(2), state each indication concisely. Include the specific patient population, disease/condition, and any limitations of use. For oncology products, specify tumor type, biomarker requirements, and line of therapy. Biosimilar labeling should reference the licensed conditions of use per the BPCI Act but may use different language per FDA biosimilar labeling guidance.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'indications_list',
            label: 'Indications (list each separately)',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., 1. Treatment of adult patients with metastatic non-small cell lung cancer (NSCLC) whose tumors express PD-L1 (TPS ≥1%) as determined by an FDA-approved test.\n2. First-line treatment of ...',
          },
          {
            id: 'limitations_of_use',
            label: 'Limitations of Use',
            type: 'textarea',
            placeholder: 'e.g., Not indicated for treatment of patients with EGFR or ALK genomic tumor aberrations.',
          },
          {
            id: 'companion_diagnostic',
            label: 'Is a companion diagnostic required?',
            type: 'yes_no',
            helpText: 'If yes, include the name of the FDA-approved companion diagnostic test in the Indications section.',
          },
          {
            id: 'companion_diagnostic_name',
            label: 'Companion Diagnostic Test Name',
            type: 'text',
            placeholder: 'e.g., Dako PD-L1 IHC 22C3 pharmDx',
            visibleWhen: { field: 'companion_diagnostic', operator: 'eq', value: 'yes' },
          },
          {
            id: 'orphan_designation',
            label: 'Does the product have Orphan Drug designation?',
            type: 'yes_no',
            helpText: 'Orphan designation may affect labeling scope and market exclusivity claims.',
          },
          {
            id: 'accelerated_approval',
            label: 'Is this an accelerated approval based on a surrogate endpoint?',
            type: 'yes_no',
            helpText: 'If yes, the labeling must include a limitation statement noting that continued approval may be contingent on confirmatory trials.',
          },
          {
            id: 'biosimilar_indication_carveout',
            label: 'Are any reference product indications being carved out?',
            type: 'yes_no',
            helpText: 'Under 351(k), biosimilars may exclude protected indications from labeling (indication carve-out).',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'biosimilar' },
          },
        ],
        defaultNext: 'dosage_and_administration',
      },

      /* ── Node 8: Dosage and Administration ──────────────────────── */
      {
        id: 'dosage_and_administration',
        section: 'Indications & Usage',
        question:
          'Detail the Dosage and Administration section.',
        guidance:
          'Per 21 CFR 201.57(c)(3), include recommended dosage, route, frequency, duration, and dose modifications. Provide dosing for each indication separately if different. Include reconstitution/dilution instructions for injectables, and dose adjustments for hepatic/renal impairment, drug interactions, and adverse reactions.',
        fields: [
          {
            id: 'recommended_dosage',
            label: 'Recommended Dosage (for each indication)',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., 200 mg IV every 3 weeks until disease progression or unacceptable toxicity.\nFor Indication 2: 400 mg IV every 6 weeks.',
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'iv', label: 'Intravenous (IV)' },
              { value: 'sc', label: 'Subcutaneous (SC)' },
              { value: 'im', label: 'Intramuscular (IM)' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhalation', label: 'Inhalation' },
              { value: 'ophthalmic', label: 'Ophthalmic' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'dose_modifications',
            label: 'Dose Modifications for Adverse Reactions / Organ Impairment',
            type: 'textarea',
            placeholder: 'Describe dose reduction steps, hold criteria, and discontinuation criteria.',
          },
          {
            id: 'preparation_instructions',
            label: 'Preparation and Administration Instructions',
            type: 'textarea',
            placeholder: 'e.g., Reconstitute with 2.3 mL Sterile Water for Injection. Dilute in 0.9% NaCl to final concentration of 1-10 mg/mL. Infuse over 30 minutes.',
          },
          {
            id: 'missed_dose_instructions',
            label: 'Missed Dose Instructions',
            type: 'textarea',
            placeholder: 'e.g., If a dose is missed, administer as soon as possible; do not wait until the next planned dose.',
          },
        ],
        defaultNext: 'boxed_warning_assessment',
      },

      /* ─────────────────────────────────────────────────────────────
       *  SECTION 5 — Warnings & Precautions
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'boxed_warning_assessment',
        section: 'Warnings & Precautions',
        question:
          'Does the product require a Boxed Warning ("Black Box Warning")?',
        guidance:
          'Per 21 CFR 201.57(c)(1), a Boxed Warning is reserved for serious risks that are important enough to be highlighted for prescribers. FDA determines the need for a Boxed Warning. Common triggers include: serious or life-threatening adverse reactions, contraindications that could be fatal, and safety concerns requiring specific monitoring. All products with REMS should evaluate whether a Boxed Warning is warranted.',
        fields: [
          {
            id: 'boxed_warning_required',
            label: 'Is a Boxed Warning required?',
            type: 'select',
            required: true,
            options: [
              { value: 'yes', label: 'Yes — Boxed Warning is required' },
              { value: 'no', label: 'No — No Boxed Warning' },
              { value: 'under_discussion', label: 'Under discussion with FDA' },
            ],
          },
          {
            id: 'boxed_warning_text',
            label: 'Boxed Warning Text',
            type: 'textarea',
            placeholder: 'WARNING: [SERIOUS RISK]\nSee full prescribing information for complete boxed warning.\n• [Key point 1]\n• [Key point 2]',
            visibleWhen: { field: 'boxed_warning_required', operator: 'in', value: ['yes', 'under_discussion'] },
          },
          {
            id: 'boxed_warning_evidence_basis',
            label: 'Evidence basis for Boxed Warning',
            type: 'select',
            options: [
              { value: 'clinical_trial', label: 'Clinical trial data' },
              { value: 'postmarket', label: 'Post-marketing safety data' },
              { value: 'class_effect', label: 'Class effect (based on related drugs)' },
              { value: 'animal_data', label: 'Animal/nonclinical data' },
              { value: 'combination', label: 'Multiple evidence sources' },
            ],
            visibleWhen: { field: 'boxed_warning_required', operator: 'in', value: ['yes', 'under_discussion'] },
          },
        ],
        issueChecks: [
          {
            id: 'rems_no_boxed_warning',
            condition: { field: 'boxed_warning_required', operator: 'eq', value: 'no' },
            severity: 'warning',
            title: 'REMS Required but No Boxed Warning',
            message:
              'This product requires a REMS program, but no Boxed Warning is planned. While REMS and Boxed Warnings are independent requirements, most REMS products carry a Boxed Warning. Confirm with FDA whether a Boxed Warning is needed.',
            reference: '21 CFR 201.57(c)(1); FDA Guidance: REMS Integration with Labeling',
          },
        ],
        defaultNext: 'warnings_precautions_detail',
      },

      /* ── Node 10: Warnings & Precautions Detail ─────────────────── */
      {
        id: 'warnings_precautions_detail',
        section: 'Warnings & Precautions',
        question:
          'Detail the Warnings and Precautions section (Section 5). List each warning as a separate subsection.',
        guidance:
          'Per 21 CFR 201.57(c)(6), Warnings and Precautions must describe clinically significant adverse reactions (including severity and expected incidence), steps to prevent or mitigate harm, and monitoring recommendations. Organize by subsection (5.1, 5.2, etc.) with descriptive headings. Include laboratory abnormalities requiring monitoring and any contraindicated co-medications.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'warnings_subsections',
            label: 'Warnings and Precautions Subsections',
            type: 'textarea',
            required: true,
            placeholder: 'List each warning subsection with heading and summary, e.g.:\n5.1 Immune-Mediated Pneumonitis\n5.2 Immune-Mediated Colitis\n5.3 Hepatotoxicity\n5.4 Embryo-Fetal Toxicity',
          },
          {
            id: 'monitoring_requirements',
            label: 'Required Monitoring / Laboratory Tests',
            type: 'textarea',
            placeholder: 'e.g., Monitor liver function tests at baseline and periodically during treatment. Monitor blood glucose in diabetic patients.',
          },
          {
            id: 'hypersensitivity_warning',
            label: 'Does the product carry a hypersensitivity / anaphylaxis warning?',
            type: 'yes_no',
          },
          {
            id: 'embryo_fetal_toxicity',
            label: 'Is there an embryo-fetal toxicity warning?',
            type: 'yes_no',
            helpText: 'If yes, include pregnancy testing requirements and contraception recommendations.',
          },
          {
            id: 'driving_machinery_warning',
            label: 'Warnings regarding driving or operating machinery?',
            type: 'yes_no',
          },
        ],
        issueChecks: [
          {
            id: 'missing_hypersensitivity',
            condition: { field: 'hypersensitivity_warning', operator: 'eq', value: 'no' },
            severity: 'warning',
            title: 'No Hypersensitivity Warning',
            message:
              'Consider whether a hypersensitivity / anaphylaxis warning is appropriate. Most biologic products and many small molecules include this warning even if incidence is low.',
            reference: '21 CFR 201.57(c)(6)',
          },
        ],
        defaultNext: 'adverse_reactions',
      },

      /* ── Node 11: Adverse Reactions ─────────────────────────────── */
      {
        id: 'adverse_reactions',
        section: 'Warnings & Precautions',
        question:
          'Describe the Adverse Reactions section (Section 6).',
        guidance:
          'Per 21 CFR 201.57(c)(7), list adverse reactions from clinical trials (Section 6.1) and post-marketing experience (Section 6.2, if applicable). Include adverse reactions occurring in ≥1-5% of patients (depending on program size) and serious adverse reactions regardless of incidence. Present in tabular format with incidence rates for treatment vs. control groups.',
        fields: [
          {
            id: 'clinical_trial_experience_summary',
            label: 'Clinical Trial Experience Summary (6.1)',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the safety database: total patients exposed, median duration, key demographics. Then list common adverse reactions by system organ class.',
          },
          {
            id: 'safety_database_size',
            label: 'Total patients exposed in safety database',
            type: 'number',
            required: true,
            helpText: 'Total unique patients who received the product across all clinical trials included in the safety analysis.',
            validation: { min: 0 },
          },
          {
            id: 'most_common_ars',
            label: 'Most Common Adverse Reactions (≥10%)',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Fatigue (38%), nausea (24%), rash (20%), diarrhea (18%), pruritus (17%)',
          },
          {
            id: 'serious_ars',
            label: 'Serious Adverse Reactions',
            type: 'textarea',
            placeholder: 'List serious adverse reactions including incidence, e.g., pneumonitis (3.4%), colitis (1.7%), hepatitis (0.7%)',
          },
          {
            id: 'discontinuation_due_to_ars',
            label: 'Discontinuation Rate Due to Adverse Reactions',
            type: 'text',
            placeholder: 'e.g., 12% of patients discontinued due to adverse reactions',
          },
          {
            id: 'postmarket_experience',
            label: 'Post-Marketing Experience (6.2)',
            type: 'textarea',
            placeholder: 'If applicable, list adverse reactions identified during post-approval use. Note that these are reported voluntarily and frequency cannot be reliably determined.',
          },
        ],
        issueChecks: [
          {
            id: 'missing_adverse_reporting',
            condition: { field: 'clinical_trial_experience_summary', operator: 'eq', value: '' },
            severity: 'critical',
            title: 'Missing Clinical Trial Adverse Reaction Data',
            message:
              'The Adverse Reactions section (6.1) requires a summary of the clinical trial safety database. This is a mandatory PLR section and cannot be left empty.',
            reference: '21 CFR 201.57(c)(7)',
          },
          {
            id: 'small_safety_database',
            condition: { field: 'safety_database_size', operator: 'lt', value: 300 },
            severity: 'warning',
            title: 'Small Safety Database',
            message:
              'The safety database includes fewer than 300 patients. FDA typically expects a minimum of 300-600 patients with 6 months of exposure (ICH E1) for chronic use drugs. Consider whether additional safety data collection is needed before labeling finalization.',
            reference: 'ICH E1: The Extent of Population Exposure to Assess Clinical Safety',
          },
        ],
        defaultNext: 'contraindications',
      },

      /* ── Node 12: Contraindications ─────────────────────────────── */
      {
        id: 'contraindications',
        section: 'Warnings & Precautions',
        question:
          'Define the Contraindications section (Section 4).',
        guidance:
          'Per 21 CFR 201.57(c)(5), contraindications should only list situations where the risk clearly outweighs any possible benefit. Do not confuse with Warnings and Precautions. Contraindications typically include known hypersensitivity to the active ingredient, co-administration of specific drugs, and specific disease states where the product must not be used.',
        fields: [
          {
            id: 'contraindications_list',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
            placeholder: 'List each contraindication, e.g.:\n4.1 Known severe hypersensitivity to [drug] or any component of the formulation.\n4.2 Concomitant use with [drug X] due to risk of [serious event].',
          },
          {
            id: 'contraindication_count',
            label: 'Number of contraindications',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
        ],
        issueChecks: [
          {
            id: 'zero_contraindications',
            condition: { field: 'contraindication_count', operator: 'eq', value: 0 },
            severity: 'info',
            title: 'No Contraindications Listed',
            message:
              'No contraindications have been identified. While some products genuinely have "None" for contraindications, confirm this is intentional. At minimum, consider whether known hypersensitivity to the active ingredient should be listed.',
            reference: '21 CFR 201.57(c)(5)',
          },
        ],
        defaultNext: 'specific_populations',
      },

      /* ─────────────────────────────────────────────────────────────
       *  SECTION 6 — Patient Labeling
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'specific_populations',
        section: 'Patient Labeling',
        question:
          'Address Use in Specific Populations (Section 8).',
        guidance:
          'Per 21 CFR 201.57(c)(9) and the Pregnancy and Lactation Labeling Rule (PLLR, 2015), Section 8 must include: 8.1 Pregnancy (including lactation risk summary and data), 8.2 Lactation, 8.3 Females and Males of Reproductive Potential, 8.4 Pediatric Use, and 8.5 Geriatric Use. The old pregnancy letter categories (A/B/C/D/X) have been replaced by the PLLR narrative format.',
        fields: [
          {
            id: 'pregnancy_risk_summary',
            label: 'Pregnancy Risk Summary (8.1)',
            type: 'textarea',
            required: true,
            placeholder: 'Based on [findings from animal studies / mechanism of action / human data], [drug] can cause fetal harm when administered to a pregnant woman...',
          },
          {
            id: 'pregnancy_human_data',
            label: 'Human Data Available for Pregnancy?',
            type: 'yes_no',
          },
          {
            id: 'lactation_risk_summary',
            label: 'Lactation Risk Summary (8.2)',
            type: 'textarea',
            required: true,
            placeholder: 'Describe whether the drug is present in human milk, effects on the breastfed infant, and effects on milk production.',
          },
          {
            id: 'reproductive_potential',
            label: 'Females and Males of Reproductive Potential (8.3)',
            type: 'textarea',
            placeholder: 'Include pregnancy testing requirements, contraception recommendations, and infertility information.',
          },
          {
            id: 'pediatric_use',
            label: 'Pediatric Use (8.4)',
            type: 'textarea',
            placeholder: 'Describe established safety/effectiveness in pediatric populations, or state that it has not been established. Include age ranges studied.',
          },
          {
            id: 'pediatric_studies_conducted',
            label: 'Have pediatric studies been conducted?',
            type: 'yes_no',
          },
          {
            id: 'geriatric_use',
            label: 'Geriatric Use (8.5)',
            type: 'textarea',
            placeholder: 'Describe the number of patients aged ≥65 in clinical studies. Note any differences in safety or effectiveness compared to younger patients.',
          },
          {
            id: 'geriatric_patients_studied',
            label: 'Number of patients aged ≥65 included in clinical studies',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'hepatic_impairment',
            label: 'Hepatic Impairment (8.6)',
            type: 'textarea',
            placeholder: 'Describe dosing recommendations for patients with hepatic impairment (Child-Pugh A, B, C).',
          },
          {
            id: 'renal_impairment',
            label: 'Renal Impairment (8.7)',
            type: 'textarea',
            placeholder: 'Describe dosing recommendations for patients with renal impairment (mild, moderate, severe, ESRD).',
          },
        ],
        issueChecks: [
          {
            id: 'no_pregnancy_data',
            condition: { field: 'pregnancy_human_data', operator: 'eq', value: 'no' },
            severity: 'warning',
            title: 'No Human Pregnancy Data Available',
            message:
              'No human pregnancy data is available. The PLLR requires a narrative risk summary even without human data. Include animal reproductive toxicology data and mechanism-based risk assessment. Consider whether a pregnancy registry should be established.',
            reference: 'FDA PLLR Final Rule (December 2014); 21 CFR 201.57(c)(9)(i)',
          },
          {
            id: 'missing_pediatric_section',
            condition: { field: 'pediatric_studies_conducted', operator: 'eq', value: 'no' },
            severity: 'info',
            title: 'No Pediatric Studies Conducted',
            message:
              'No pediatric studies have been conducted. Under PREA (Pediatric Research Equity Act), pediatric studies are generally required unless a waiver or deferral has been granted. Include a statement that safety and effectiveness have not been established in pediatric patients.',
            reference: '21 CFR 314.55 (PREA); 21 CFR 201.57(c)(9)(iv)',
          },
          {
            id: 'missing_geriatric_section',
            condition: { field: 'geriatric_patients_studied', operator: 'lt', value: 100 },
            severity: 'warning',
            title: 'Limited Geriatric Data',
            message:
              'Fewer than 100 patients aged ≥65 were included in clinical studies. ICH E7 recommends a meaningful representation of elderly patients. The labeling should clearly state the number of geriatric patients studied and whether differences were observed.',
            reference: 'ICH E7: Studies in Support of Special Populations — Geriatrics; 21 CFR 201.57(c)(9)(v)',
          },
        ],
        defaultNext: 'patient_counseling_info',
      },

      /* ── Node 14: Patient Counseling Information ────────────────── */
      {
        id: 'patient_counseling_info',
        section: 'Patient Labeling',
        question:
          'Define the Patient Counseling Information section (Section 17).',
        guidance:
          'Per 21 CFR 201.57(c)(18), this section provides key messages for healthcare providers to communicate to patients. Include advice on important safety precautions, common side effects to report, storage requirements, and whether a patient labeling document (Medication Guide, PPI, or IFU) is provided.',
        fields: [
          {
            id: 'counseling_topics',
            label: 'Key Counseling Topics',
            type: 'textarea',
            required: true,
            placeholder: 'e.g.,\n• Signs and symptoms of serious allergic reactions\n• Need for regular blood tests\n• Embryo-fetal toxicity and contraception requirements\n• Report symptoms of liver injury',
          },
          {
            id: 'patient_labeling_type',
            label: 'Type of Patient Labeling',
            type: 'multi_select',
            options: [
              { value: 'medication_guide', label: 'Medication Guide (21 CFR 208)' },
              { value: 'ppi', label: 'Patient Package Insert' },
              { value: 'ifu', label: 'Instructions for Use (IFU)' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'patient_material_reading_level',
            label: 'Patient material reading level',
            type: 'select',
            options: [
              { value: '6th_grade', label: '6th grade level or below' },
              { value: '8th_grade', label: '7th-8th grade level' },
              { value: 'high_school', label: 'High school level' },
              { value: 'not_assessed', label: 'Not yet assessed' },
            ],
            helpText: 'FDA recommends patient materials be written at a 6th-8th grade reading level.',
          },
        ],
        issueChecks: [
          {
            id: 'high_literacy_patient_material',
            condition: { field: 'patient_material_reading_level', operator: 'eq', value: 'high_school' },
            severity: 'warning',
            title: 'Patient Material Reading Level Too High',
            message:
              'Patient-facing materials are written at a high school reading level. FDA recommends a 6th-8th grade reading level to ensure broad comprehension. Consider revising for readability.',
            reference: 'FDA Guidance: Medication Guides — Distribution Requirements and Inclusion in REMS (2011)',
          },
        ],
        defaultNext: 'medication_guide_assessment',
      },

      /* ── Node 15: Medication Guide Assessment ───────────────────── */
      {
        id: 'medication_guide_assessment',
        section: 'Patient Labeling',
        question:
          'Is a Medication Guide required for this product?',
        guidance:
          'Per 21 CFR 208, a Medication Guide is required when: (1) patient labeling could help prevent serious adverse effects, (2) the product has serious risks relative to benefits that patients should know about, or (3) patient adherence to directions for use is critical. All products with REMS that include a Medication Guide element must have one. The Medication Guide must be written in patient-friendly language.',
        fields: [
          {
            id: 'medication_guide_required',
            label: 'Is a Medication Guide required?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'medication_guide_status',
            label: 'Medication Guide status',
            type: 'select',
            visibleWhen: { field: 'medication_guide_required', operator: 'eq', value: 'yes' },
            options: [
              { value: 'drafted', label: 'Drafted — awaiting FDA review' },
              { value: 'fda_approved', label: 'FDA-approved content' },
              { value: 'under_revision', label: 'Under revision' },
              { value: 'not_started', label: 'Not yet started' },
            ],
          },
          {
            id: 'medication_guide_topics',
            label: 'Key topics covered in the Medication Guide',
            type: 'textarea',
            visibleWhen: { field: 'medication_guide_required', operator: 'eq', value: 'yes' },
            placeholder: 'e.g., What is [DRUG]? Who should not take [DRUG]? What are the possible side effects? How should I store [DRUG]?',
          },
          {
            id: 'med_guide_distribution_plan',
            label: 'Distribution plan for the Medication Guide',
            type: 'select',
            visibleWhen: { field: 'medication_guide_required', operator: 'eq', value: 'yes' },
            options: [
              { value: 'with_each_dispensing', label: 'With each dispensing (standard)' },
              { value: 'rems_distribution', label: 'Through REMS distribution system' },
              { value: 'other', label: 'Other distribution method' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'rems_no_medication_guide',
            condition: { field: 'medication_guide_required', operator: 'eq', value: 'no' },
            severity: 'warning',
            title: 'REMS Product Without Medication Guide',
            message:
              'This product has a REMS requirement but no Medication Guide is planned. Many REMS programs include a Medication Guide as a required element. Verify with FDA whether a Medication Guide is needed as part of the REMS.',
            reference: '21 CFR 208; FDA REMS Guidance',
          },
        ],
        defaultNext: null,
      },

      /* ── Node 16: OTC Drug Facts (conditional) ──────────────────── */
      {
        id: 'otc_drug_facts',
        section: 'Patient Labeling',
        question:
          'Complete the OTC Drug Facts labeling (21 CFR 201.66).',
        guidance:
          'OTC products must display a "Drug Facts" panel in a standardized format per 21 CFR 201.66. This replaces the PLR format for OTC products. The Drug Facts panel must include: Active ingredient(s), Purpose, Uses, Warnings (including allergy alert, stomach bleeding warning if applicable), Directions, Other information, Inactive ingredients, and Questions? phone number.',
        fields: [
          {
            id: 'otc_active_ingredients',
            label: 'Active Ingredient(s) and Strength',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Ibuprofen 200 mg (NSAID*)\n*nonsteroidal anti-inflammatory drug',
          },
          {
            id: 'otc_purpose',
            label: 'Purpose',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Pain reliever/Fever reducer',
          },
          {
            id: 'otc_uses',
            label: 'Uses',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Temporarily relieves minor aches and pains due to: headache, muscular aches, minor pain of arthritis, toothache, backache, the common cold, menstrual cramps. Temporarily reduces fever.',
          },
          {
            id: 'otc_warnings',
            label: 'Warnings',
            type: 'textarea',
            required: true,
            placeholder: 'Include: Allergy alert, Stomach bleeding warning (for NSAIDs), Heart attack and stroke warning (for NSAIDs), Do not use, Ask a doctor before use if, Ask a doctor or pharmacist before use if, When using this product, Stop use and ask a doctor if, Pregnancy/breastfeeding warning, Keep out of reach of children.',
          },
          {
            id: 'otc_directions',
            label: 'Directions',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Adults and children 12 years and over: take 1 tablet every 4 to 6 hours while symptoms persist. Do not exceed 3 tablets in 24 hours unless directed by a doctor.',
          },
          {
            id: 'otc_inactive_ingredients',
            label: 'Inactive Ingredients',
            type: 'textarea',
            required: true,
            placeholder: 'List all inactive ingredients in alphabetical order.',
          },
          {
            id: 'otc_questions_number',
            label: 'Questions? Phone Number',
            type: 'text',
            required: true,
            placeholder: 'e.g., 1-800-XXX-XXXX',
          },
        ],
        defaultNext: null,
      },

      /* ─────────────────────────────────────────────────────────────
       *  SECTION 7 — Device-Specific Labeling (conditional branch)
       * ───────────────────────────────────────────────────────────── */
      {
        id: 'device_labeling_801',
        section: 'Device-Specific Labeling',
        question:
          'Let\'s address device labeling requirements under 21 CFR 801.',
        guidance:
          'Medical device labeling is governed by 21 CFR 801 (general), 21 CFR 809 (IVDs), and 21 CFR 830 (UDI). Device labeling must include: device description, indications for use, contraindications, warnings and precautions, adverse events, directions for use (including assembly and operating instructions), and sterilization information if applicable.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'device_classification',
            label: 'Device Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I (General Controls)' },
              { value: 'class_ii', label: 'Class II (Special Controls — 510(k))' },
              { value: 'class_iii', label: 'Class III (PMA)' },
              { value: 'ivd', label: 'In Vitro Diagnostic (IVD)' },
            ],
          },
          {
            id: 'device_description',
            label: 'Device Description',
            type: 'textarea',
            required: true,
            placeholder: 'Physical description, materials, components, accessories, dimensions, operating principles.',
          },
          {
            id: 'device_intended_use',
            label: 'Intended Use / Indications for Use',
            type: 'textarea',
            required: true,
            placeholder: 'The specific use for which the device is intended, as cleared/approved by FDA.',
          },
          {
            id: 'device_contraindications',
            label: 'Contraindications',
            type: 'textarea',
            placeholder: 'Conditions or situations where the device should not be used.',
          },
          {
            id: 'device_warnings_precautions',
            label: 'Warnings and Precautions',
            type: 'textarea',
            required: true,
            placeholder: 'Hazards, risks, or unsafe practices associated with device use.',
          },
          {
            id: 'device_sterile',
            label: 'Is the device provided sterile?',
            type: 'yes_no',
          },
          {
            id: 'device_single_use',
            label: 'Is the device single-use?',
            type: 'yes_no',
            helpText: 'Single-use devices must clearly state "Single Use Only" or "Do Not Reuse" on the label.',
          },
          {
            id: 'device_home_use',
            label: 'Is the device intended for home use (lay user)?',
            type: 'yes_no',
            helpText: 'Home-use devices require additional labeling considerations per FDA guidance on home-use labeling.',
          },
          {
            id: 'device_software_controlled',
            label: 'Does the device contain software (SaMD/SiMD)?',
            type: 'yes_no',
            helpText: 'Software-controlled devices may require additional labeling about cybersecurity, updates, and version information.',
          },
        ],
        issueChecks: [
          {
            id: 'home_use_labeling',
            condition: { field: 'device_home_use', operator: 'eq', value: 'yes' },
            severity: 'warning',
            title: 'Home-Use Device — Additional Labeling Required',
            message:
              'Devices intended for home use by lay users require labeling written at a lower reading level, with clear illustrations, and must address patient self-testing / self-care scenarios. Review FDA guidance on medical device home-use labeling.',
            reference: '21 CFR 801.4; FDA Guidance: Medical Device Home-Use Initiative (2023)',
          },
        ],
        defaultNext: 'device_ifu_content',
      },

      /* ── Node 18: Device Instructions for Use ───────────────────── */
      {
        id: 'device_ifu_content',
        section: 'Device-Specific Labeling',
        question:
          'Detail the Instructions for Use (IFU) content.',
        guidance:
          'The IFU must provide step-by-step directions for safe and effective use, including patient preparation, device setup/assembly, operation, maintenance, cleaning/disinfection, troubleshooting, and disposal. For IVDs, include specimen collection, assay procedure, results interpretation, and quality control requirements per 21 CFR 809.10.',
        fields: [
          {
            id: 'ifu_patient_preparation',
            label: 'Patient Preparation (if applicable)',
            type: 'textarea',
            placeholder: 'e.g., Clean the application site with alcohol wipe. Allow to dry completely.',
          },
          {
            id: 'ifu_setup_instructions',
            label: 'Device Setup / Assembly Instructions',
            type: 'textarea',
            required: true,
            placeholder: 'Step-by-step assembly and setup instructions. Include illustrations reference if applicable.',
          },
          {
            id: 'ifu_operating_instructions',
            label: 'Operating Instructions',
            type: 'textarea',
            required: true,
            placeholder: 'Step-by-step use instructions. Include critical steps and expected outputs.',
          },
          {
            id: 'ifu_maintenance',
            label: 'Maintenance, Cleaning, and Disinfection',
            type: 'textarea',
            placeholder: 'Cleaning procedures, disinfection methods, reprocessing instructions (if reusable).',
          },
          {
            id: 'ifu_troubleshooting',
            label: 'Troubleshooting / Error Messages',
            type: 'textarea',
            placeholder: 'Common error conditions and corrective actions.',
          },
          {
            id: 'ifu_disposal',
            label: 'Disposal Instructions',
            type: 'textarea',
            placeholder: 'Safe disposal instructions, including biohazard considerations if applicable.',
          },
          {
            id: 'ivd_specimen_requirements',
            label: 'Specimen Collection and Handling Requirements (IVD only)',
            type: 'textarea',
            placeholder: 'Specimen types, collection containers, transport conditions, stability requirements.',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'ivd' },
          },
          {
            id: 'ivd_performance_characteristics',
            label: 'Performance Characteristics (IVD only)',
            type: 'textarea',
            placeholder: 'Sensitivity, specificity, accuracy, precision, linearity, analytical measurement range, interfering substances.',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'ivd' },
          },
        ],
        defaultNext: 'device_udi_symbols',
      },

      /* ── Node 19: Device UDI and Symbols ────────────────────────── */
      {
        id: 'device_udi_symbols',
        section: 'Device-Specific Labeling',
        question:
          'Address UDI compliance and standardized symbols on device labeling.',
        guidance:
          'Per 21 CFR 830, all medical devices must bear a Unique Device Identifier (UDI) on their label. The UDI consists of a Device Identifier (DI) and Production Identifier (PI). Labels should use standardized symbols per FDA-recognized standards (ISO 15223-1, IEC 60417) and include a symbol glossary if symbols are used without adjacent text.',
        fields: [
          {
            id: 'udi_compliance',
            label: 'Is the device UDI-compliant?',
            type: 'yes_no',
            required: true,
            helpText: 'UDI is required for all devices except certain exemptions (21 CFR 830.30).',
          },
          {
            id: 'udi_issuing_agency',
            label: 'UDI Issuing Agency',
            type: 'select',
            options: [
              { value: 'gs1', label: 'GS1' },
              { value: 'hibcc', label: 'HIBCC' },
              { value: 'iccbba', label: 'ICCBBA' },
            ],
          },
          {
            id: 'gudid_listing_status',
            label: 'GUDID Listing Status',
            type: 'select',
            options: [
              { value: 'listed', label: 'Listed in GUDID' },
              { value: 'pending', label: 'Pending submission' },
              { value: 'not_submitted', label: 'Not yet submitted' },
            ],
            helpText: 'UDI device information must be submitted to the FDA Global Unique Device Identification Database (GUDID).',
          },
          {
            id: 'symbols_standard',
            label: 'Standardized Symbols Used',
            type: 'multi_select',
            options: [
              { value: 'iso_15223', label: 'ISO 15223-1 (Medical Device Symbols)' },
              { value: 'iec_60417', label: 'IEC 60417 (Graphical Symbols)' },
              { value: 'iso_7000', label: 'ISO 7000 (Graphical Symbols for Equipment)' },
              { value: 'astm_d7298', label: 'ASTM D7298 (Symbols in Healthcare)' },
            ],
          },
          {
            id: 'symbol_glossary_included',
            label: 'Is a symbol glossary included in the labeling?',
            type: 'yes_no',
            helpText: 'Per 21 CFR 801.15(c)(2), if symbols are used without adjacent explanatory text, a glossary must be included in the labeling or available via a toll-free number or website.',
          },
          {
            id: 'labeling_expiration_info',
            label: 'Expiration Date / Shelf Life on Label',
            type: 'text',
            placeholder: 'e.g., 24 months from date of manufacture; Use By date in YYYY-MM format.',
          },
          {
            id: 'lot_serial_tracking',
            label: 'Lot / Serial Number on Label',
            type: 'select',
            options: [
              { value: 'lot_only', label: 'Lot number only' },
              { value: 'serial_only', label: 'Serial number only' },
              { value: 'both', label: 'Both lot and serial number' },
            ],
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
