/**
 * Product Labeling flow definition for the AnA Intelligence Questioning system.
 *
 * Guides sponsors through a comprehensive labeling questionnaire covering
 * prescription drugs (USPI per 21 CFR 201.57 PLR format), OTC drugs
 * (Drug Facts per 21 CFR 201.66), biologics/biosimilars, and medical
 * devices (21 CFR 801). Addresses all required sections, safety
 * information, patient labeling, safety communications, and regulatory
 * formatting requirements.
 *
 * 20 nodes · 90+ fields · 8 sections · 14 issue checks
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
      'Comprehensive labeling questionnaire for drugs (USPI per 21 CFR 201.57 PLR format) and medical devices (21 CFR 801), covering all required sections, safety information, and regulatory formatting requirements.',
    clientTypes: [],
    entryNode: 'labeling_overview',
    estimatedMinutes: 40,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'labeling_overview',
        label: 'Labeling Overview',
        nodeIds: ['labeling_overview', 'labeling_format'],
      },
      {
        id: 'highlights',
        label: 'Highlights Section',
        nodeIds: ['highlights_boxed_warning', 'highlights_summary'],
      },
      {
        id: 'fpi',
        label: 'Full Prescribing Information',
        nodeIds: ['fpi_indications', 'fpi_dosage', 'fpi_safety', 'fpi_clinical_studies'],
      },
      {
        id: 'specific_populations',
        label: 'Use in Specific Populations',
        nodeIds: ['specific_pops_pregnancy', 'specific_pops_other'],
      },
      {
        id: 'device_labeling',
        label: 'Device Labeling',
        nodeIds: ['device_label_content', 'device_ifu'],
      },
      {
        id: 'patient_labeling',
        label: 'Patient Labeling',
        nodeIds: ['patient_med_guide', 'patient_counseling'],
      },
      {
        id: 'safety_communication',
        label: 'Safety Communication',
        nodeIds: ['safety_letters', 'safety_post_marketing'],
      },
      {
        id: 'regulatory_review',
        label: 'Regulatory Review',
        nodeIds: ['reg_review_fda', 'reg_review_promotional'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 1 — Labeling Overview                                   */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'labeling_overview',
        section: 'labeling_overview',
        question:
          'Let\'s begin with the product labeling overview. What type of product is this, and what is the purpose of this labeling effort?',
        guidance:
          'FDA labeling requirements differ by product category. Prescription drugs follow 21 CFR 201.57 (Physician Labeling Rule, PLR) and must use the structured format with Highlights, Full Prescribing Information, and Patient Labeling. OTC drugs require the standardized Drug Facts format per 21 CFR 201.66. Biologics follow the same PLR format as prescription drugs but may have additional considerations (e.g., biosimilar-specific labeling per the BPCIA). Medical devices are labeled per 21 CFR 801 and include Instructions for Use (IFU). Reference: FDA Guidance "Labeling for Human Prescription Drug and Biological Products — Implementing the PLR Content and Format Requirements" (2013).',
        fields: [
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'prescription_drug', label: 'Prescription Drug (Rx)', description: 'Labeled per 21 CFR 201.57 PLR format' },
              { value: 'otc_drug', label: 'Over-the-Counter Drug (OTC)', description: 'Drug Facts format per 21 CFR 201.66' },
              { value: 'biologic', label: 'Biologic (BLA product)', description: 'PLR format; additional biosimilar considerations if applicable' },
              { value: 'medical_device', label: 'Medical Device', description: 'Labeled per 21 CFR 801; includes IFU' },
            ],
          },
          {
            id: 'is_biosimilar',
            label: 'Is this a biosimilar or interchangeable biologic?',
            type: 'yes_no',
            required: true,
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'biologic',
            },
            helpText:
              'Biosimilars are licensed under Section 351(k) of the PHS Act (BPCIA). Labeling must include the proper suffix and may not extrapolate all indications from the reference product without supporting data. See FDA Guidance "Labeling for Biosimilar Products" (2018).',
          },
          {
            id: 'labeling_purpose',
            label: 'Labeling Purpose',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original Labeling (new approval)' },
              { value: 'revision', label: 'Labeling Revision (post-approval change)' },
              { value: 'supplement', label: 'Labeling Supplement (sNDA/sBLA)', description: 'Per 21 CFR 314.70 / 21 CFR 601.12' },
              { value: 'annual_update', label: 'Annual Report Labeling Update' },
            ],
          },
          {
            id: 'product_name_proprietary',
            label: 'Proprietary (Brand) Name',
            type: 'text',
            placeholder: 'e.g., Keytruda',
            required: true,
          },
          {
            id: 'product_name_established',
            label: 'Established (Generic) Name',
            type: 'text',
            placeholder: 'e.g., pembrolizumab',
            required: true,
          },
          {
            id: 'current_labeling_version',
            label: 'Current Labeling Version / Revision Date',
            type: 'text',
            placeholder: 'e.g., Version 15, revised 03/2025',
            helpText:
              'Per 21 CFR 201.57(a)(4), the date of the most recent revision must appear in the Highlights section. Track version numbers for internal change control.',
          },
          {
            id: 'nda_bla_anda_number',
            label: 'NDA / BLA / ANDA / 510(k) Number',
            type: 'text',
            placeholder: 'e.g., NDA 215498, BLA 761045, K212345',
            required: true,
          },
        ],
        issueChecks: [
          {
            id: 'otc_no_drug_facts',
            condition: { field: 'product_type', operator: 'eq', value: 'otc_drug' },
            severity: 'critical',
            title: 'OTC Drug Requires Drug Facts Format',
            message:
              'OTC drugs must use the standardized Drug Facts labeling format per 21 CFR 201.66. This format is mandatory and differs substantially from the PLR format used for prescription drugs. Ensure all required Drug Facts elements are addressed: Active Ingredient, Purpose, Uses, Warnings, Directions, Other Information, Inactive Ingredients.',
            reference: '21 CFR 201.66; FDA OTC Drug Facts Labeling Final Rule (1999)',
          },
        ],
        defaultNext: 'labeling_format',
      },

      {
        id: 'labeling_format',
        section: 'labeling_overview',
        question:
          'Provide details about the labeling format and compliance status. Is the labeling in PLR format (for drugs/biologics) or does it follow 21 CFR 801 (for devices)?',
        guidance:
          'The Physician Labeling Rule (PLR, 21 CFR 201.56 and 201.57) requires prescription drug labeling to be organized into specific sections with standardized headers. The Highlights section must appear first, followed by a Table of Contents and then Full Prescribing Information. The PLR format was phased in starting June 2006; products approved before June 2001 may use the older format but FDA encourages conversion. For devices, 21 CFR 801 governs general labeling requirements, and 21 CFR 809 covers IVDs. Reference: FDA Guidance "Physician Labeling Rule" (2013); FDA Guidance "Guidelines for the Format and Content of the Nonclinical Pharmacology/Toxicology Section" as it relates to labeling claims.',
        fields: [
          {
            id: 'plr_compliant',
            label: 'Is the labeling in PLR format (21 CFR 201.57)?',
            type: 'yes_no',
            required: true,
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['prescription_drug', 'biologic'],
            },
            helpText:
              'Products approved after June 30, 2006 must use PLR format. Products approved between June 2001 and June 2006 must convert upon the first labeling supplement.',
          },
          {
            id: 'drug_facts_compliant',
            label: 'Does the label comply with Drug Facts format (21 CFR 201.66)?',
            type: 'yes_no',
            required: true,
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'otc_drug',
            },
          },
          {
            id: 'device_labeling_standard',
            label: 'Device Labeling Standard',
            type: 'select',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'medical_device',
            },
            options: [
              { value: 'cfr_801', label: '21 CFR 801 — General Device Labeling' },
              { value: 'cfr_809', label: '21 CFR 809 — In Vitro Diagnostic (IVD) Labeling' },
              { value: 'cfr_801_809', label: 'Both 21 CFR 801 and 809' },
            ],
          },
          {
            id: 'spl_submission',
            label: 'Will this labeling be submitted as Structured Product Labeling (SPL)?',
            type: 'yes_no',
            required: true,
            helpText:
              'Per FDA Electronic Submissions Gateway requirements, labeling for human drugs and biologics must be submitted in SPL (XML) format. SPL is defined by HL7 standards and submitted via the FDA ESG. Reference: FDA Guidance "Providing Regulatory Submissions in Electronic Format — Human Pharmaceutical Product Applications and Related Submissions Using the eCTD Specifications" (2022).',
          },
          {
            id: 'dailymed_listing',
            label: 'Is the product currently listed on DailyMed/National Drug Code Directory?',
            type: 'yes_no',
            helpText:
              'DailyMed (https://dailymed.nlm.nih.gov) is the official source for FDA-approved labeling. Product listing is required under 21 CFR 207 (drug listing) and 21 CFR 807 (device listing).',
          },
          {
            id: 'biosimilar_suffix',
            label: 'Biosimilar Nonproprietary Name Suffix',
            type: 'text',
            placeholder: 'e.g., -axxs (as in bevacizumab-axxs)',
            visibleWhen: {
              field: 'is_biosimilar',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Per FDA Guidance "Nonproprietary Naming of Biological Products" (2017), biosimilars must include a unique four-letter suffix appended with a hyphen to the core name (e.g., adalimumab-atto). The suffix is assigned by FDA.',
          },
          {
            id: 'interchangeability_status',
            label: 'Has interchangeability been granted?',
            type: 'select',
            visibleWhen: {
              field: 'is_biosimilar',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'granted', label: 'Yes — Interchangeable designation granted' },
              { value: 'under_review', label: 'Under review' },
              { value: 'not_sought', label: 'Not sought' },
            ],
            helpText:
              'Interchangeable biosimilars (Section 351(k)(4) PHS Act) may be substituted at the pharmacy without prescriber intervention. The labeling must reflect this designation. Reference: FDA Guidance "Considerations in Demonstrating Interchangeability With a Reference Product" (2019).',
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'eq', value: 'medical_device' },
            goto: 'device_label_content',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'otc_drug' },
            goto: 'patient_med_guide',
          },
        ],
        defaultNext: 'highlights_boxed_warning',
        provideExpertFeedback: true,
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 2 — Highlights Section (drugs/biologics only)           */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'highlights_boxed_warning',
        section: 'highlights',
        question:
          'The Highlights section is the first part of the USPI. Does this product have a Boxed Warning, and what are the key safety signals that must be prominently displayed?',
        guidance:
          'Per 21 CFR 201.57(c)(1), the Highlights section must begin with any Boxed Warning. A Boxed Warning is required when there is an adverse reaction so serious in proportion to the potential benefit that it is essential that it be considered in assessing whether to use the drug (21 CFR 201.57(c)(1)). The decision to require a boxed warning is made by FDA. Per 21 CFR 201.57(c)(1), the boxed warning must summarize the risk, the population affected, and relevant safety information. Recent FDA guidance also recommends bold formatting for critical safety text. Reference: FDA Guidance "Warnings and Precautions, Contraindications, and Boxed Warning Sections of Labeling" (2011).',
        fields: [
          {
            id: 'has_boxed_warning',
            label: 'Does this product have a Boxed Warning?',
            type: 'yes_no',
            required: true,
            helpText:
              'Boxed Warnings (colloquially "Black Box Warnings") are the strongest safety warning FDA can require in labeling. They indicate a serious or life-threatening risk. Examples include REMS-associated products, teratogenic drugs, drugs with narrow therapeutic index, and products with known organ toxicity.',
          },
          {
            id: 'boxed_warning_text',
            label: 'Boxed Warning Text',
            type: 'textarea',
            required: true,
            visibleWhen: {
              field: 'has_boxed_warning',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., WARNING: SERIOUS INFECTIONS AND MALIGNANCIES\nSerious infections leading to hospitalization or death, including tuberculosis...',
            validation: { minLength: 50 },
            helpText:
              'Include the complete boxed warning text as it will appear in labeling. The warning must be concise and clinically actionable.',
          },
          {
            id: 'boxed_warning_basis',
            label: 'What is the basis for the Boxed Warning?',
            type: 'multi_select',
            visibleWhen: {
              field: 'has_boxed_warning',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'clinical_trials', label: 'Clinical trial data' },
              { value: 'post_marketing', label: 'Post-marketing surveillance' },
              { value: 'class_effect', label: 'Class effect (applies to drug class)' },
              { value: 'rems_required', label: 'Associated with REMS requirement' },
              { value: 'animal_data', label: 'Animal data (e.g., teratogenicity)' },
            ],
          },
          {
            id: 'life_threatening_risk',
            label: 'Does this product carry a risk of a life-threatening adverse reaction?',
            type: 'yes_no',
            required: true,
            helpText:
              'If yes and no boxed warning exists, FDA may require one. Life-threatening risks include hepatotoxicity, cardiac arrhythmia, anaphylaxis, and serious bleeding events.',
          },
          {
            id: 'initial_us_approval_year',
            label: 'Initial U.S. Approval Year',
            type: 'text',
            required: true,
            placeholder: 'e.g., 2014',
            helpText:
              'Per 21 CFR 201.57(a)(4), the year of initial FDA approval must appear in the Highlights section. This helps prescribers identify how long the product has been marketed.',
            validation: {
              pattern: '^(19|20)\\d{2}$',
              patternMessage: 'Enter a valid four-digit year (e.g., 2014).',
            },
          },
          {
            id: 'recent_major_changes',
            label: 'Recent Major Changes (within last year)',
            type: 'multi_select',
            options: [
              { value: 'boxed_warning', label: 'Boxed Warning' },
              { value: 'indications', label: 'Indications and Usage' },
              { value: 'dosage', label: 'Dosage and Administration' },
              { value: 'contraindications', label: 'Contraindications' },
              { value: 'warnings', label: 'Warnings and Precautions' },
            ],
            helpText:
              'Per 21 CFR 201.57(a)(5), the Highlights section must list the sections that have had major changes within the past year, with the date of each change.',
          },
        ],
        issueChecks: [
          {
            id: 'no_boxed_warning_life_threat',
            condition: { field: 'life_threatening_risk', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Life-Threatening Risk Without Boxed Warning Review',
            message:
              'The product carries a life-threatening risk. If no Boxed Warning is currently required, confirm with FDA whether one should be added. Products with life-threatening adverse reactions typically require a Boxed Warning per 21 CFR 201.57(c)(1). Failure to include a required boxed warning may result in FDA enforcement action.',
            reference: '21 CFR 201.57(c)(1); FDA Guidance "Warnings and Precautions" (2011)',
          },
        ],
        defaultNext: 'highlights_summary',
        provideExpertFeedback: true,
      },

      {
        id: 'highlights_summary',
        section: 'highlights',
        question:
          'Provide the summary content for each required Highlights subsection. These brief summaries direct prescribers to the relevant Full Prescribing Information sections.',
        guidance:
          'Per 21 CFR 201.57(a), the Highlights section must contain concise summaries of: Indications and Usage, Dosage and Administration, Dosage Forms and Strengths, Contraindications, Warnings and Precautions, Adverse Reactions, Drug Interactions, and Use in Specific Populations. Each summary must include a cross-reference to the corresponding FPI section number. The Highlights section must not exceed one half of a full prescribing information page in length. Reference: 21 CFR 201.57(a); FDA PLR Guidance (2013).',
        fields: [
          {
            id: 'highlights_indications',
            label: 'Indications and Usage — Highlights Summary',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., [PRODUCT] is a [pharmacologic class] indicated for [indication]. (1.1)',
            validation: { maxLength: 500 },
          },
          {
            id: 'highlights_dosage',
            label: 'Dosage and Administration — Highlights Summary',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Recommended dosage: [X mg] administered [route] every [interval]. (2.1)',
            validation: { maxLength: 500 },
          },
          {
            id: 'highlights_dosage_forms',
            label: 'Dosage Forms and Strengths',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Tablets: 100 mg, 200 mg (3)',
          },
          {
            id: 'highlights_contraindications',
            label: 'Contraindications — Highlights Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Known severe hypersensitivity to [PRODUCT] or any component. (4)',
          },
          {
            id: 'highlights_warnings',
            label: 'Warnings and Precautions — Highlights Summary',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Hepatotoxicity: Monitor liver function tests. Discontinue if ALT >5x ULN. (5.1)',
          },
          {
            id: 'highlights_adverse_reactions',
            label: 'Adverse Reactions — Highlights Summary',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Most common adverse reactions (>=20%): nausea, fatigue, diarrhea. (6.1)',
          },
          {
            id: 'highlights_drug_interactions',
            label: 'Drug Interactions — Highlights Summary',
            type: 'textarea',
            placeholder: 'e.g., Strong CYP3A4 inhibitors: Reduce [PRODUCT] dose. (7.1)',
          },
          {
            id: 'highlights_specific_pops',
            label: 'Use in Specific Populations — Highlights Summary',
            type: 'textarea',
            placeholder: 'e.g., Lactation: Advise not to breastfeed. (8.2)',
          },
        ],
        defaultNext: 'fpi_indications',
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 3 — Full Prescribing Information (drugs/biologics)      */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'fpi_indications',
        section: 'fpi',
        question:
          'Provide the full Indications and Usage section (Section 1 of the FPI). This must describe each approved indication precisely, including any limitations of use.',
        guidance:
          'Per 21 CFR 201.57(c)(2), the Indications and Usage section must state each approved indication, the population(s) for which the drug is indicated, and any limitations of use. The indication statement must be consistent with the clinical evidence. Limitations of use may include: not indicated for a specific population, no data in a subgroup, or accelerated approval conditions. For accelerated approval products, include the statement that continued approval may be contingent on confirmatory trials per 21 CFR 314.510/601.41. Reference: FDA Guidance "Indications and Usage Section of Labeling" (2018); ICH M4E(R2).',
        fields: [
          {
            id: 'approved_indication_statement',
            label: 'Approved Indication Statement',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., [PRODUCT] is a [pharmacologic class] indicated for the treatment of adult patients with [disease/condition] who have [specific criteria].',
            validation: { minLength: 50 },
          },
          {
            id: 'additional_indications',
            label: 'Additional Approved Indications (if any)',
            type: 'textarea',
            placeholder:
              'List each additional indication with its subsection number (e.g., 1.2, 1.3).',
          },
          {
            id: 'limitation_of_use',
            label: 'Limitations of Use',
            type: 'textarea',
            placeholder:
              'e.g., [PRODUCT] is not indicated for use as adjunctive therapy with [drug class].',
            helpText:
              'Limitations of use clarify what the drug is NOT indicated for, or describe conditions under which the indication applies. Per 21 CFR 201.57(c)(2)(ii), these limitations must be based on clinical data or pharmacologic considerations.',
          },
          {
            id: 'accelerated_approval',
            label: 'Was this indication granted under Accelerated Approval?',
            type: 'yes_no',
            required: true,
            helpText:
              'Products approved under Accelerated Approval (21 CFR 314.510 / 21 CFR 601.41) must include a statement that continued approval may be contingent on verification and description of clinical benefit in confirmatory trials.',
          },
          {
            id: 'approved_age_groups',
            label: 'Approved Age Groups',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'adults', label: 'Adults (>=18 years)' },
              { value: 'adolescents', label: 'Adolescents (12-17 years)' },
              { value: 'children', label: 'Children (2-11 years)' },
              { value: 'infants', label: 'Infants (1 month-2 years)' },
              { value: 'neonates', label: 'Neonates (<1 month)' },
            ],
          },
          {
            id: 'clinical_benefit_data',
            label: 'Clinical Benefit Data Supporting Indication',
            type: 'textarea',
            required: true,
            placeholder:
              'Briefly describe the clinical evidence supporting each indication (e.g., study type, population, primary endpoint, key result).',
            validation: { minLength: 100 },
          },
        ],
        defaultNext: 'fpi_dosage',
        provideExpertFeedback: true,
      },

      {
        id: 'fpi_dosage',
        section: 'fpi',
        question:
          'Provide the Dosage and Administration section (Section 2 of the FPI). Include all recommended dosages, dose modifications, preparation instructions, and administration details.',
        guidance:
          'Per 21 CFR 201.57(c)(3), the Dosage and Administration section must provide the recommended dose, route, frequency, and duration for each approved indication. It must also include dose modifications for hepatic/renal impairment, adverse reactions, and drug interactions. Preparation and reconstitution instructions are required for injectable products. Administration instructions must be specific enough for safe use. Reference: 21 CFR 201.57(c)(3); FDA Guidance "Dosage and Administration Section of Labeling" (2018).',
        fields: [
          {
            id: 'recommended_dosage',
            label: 'Recommended Dosage',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., The recommended dosage of [PRODUCT] is 200 mg administered orally once daily with food.',
            validation: { minLength: 30 },
          },
          {
            id: 'dose_modification_renal',
            label: 'Dose Modifications — Renal Impairment',
            type: 'textarea',
            placeholder:
              'e.g., Mild (CrCl 60-89 mL/min): No adjustment. Moderate (CrCl 30-59): Reduce to 100 mg. Severe (CrCl <30): Not recommended.',
            helpText:
              'Per FDA Guidance "Pharmacokinetics in Patients with Impaired Renal Function" (2020), labeling should include dosing recommendations for mild, moderate, and severe renal impairment, and ESRD/dialysis if studied.',
          },
          {
            id: 'dose_modification_hepatic',
            label: 'Dose Modifications — Hepatic Impairment',
            type: 'textarea',
            placeholder:
              'e.g., Child-Pugh A: No adjustment. Child-Pugh B: Reduce to 100 mg. Child-Pugh C: Avoid use.',
            helpText:
              'Per FDA Guidance "Pharmacokinetics in Patients with Impaired Hepatic Function" (2020) and ICH E7, hepatic dosing should be categorized by Child-Pugh classification.',
          },
          {
            id: 'dose_modification_ae',
            label: 'Dose Modifications — Adverse Reaction-Based',
            type: 'textarea',
            placeholder:
              'e.g., For Grade 3 neutropenia: Withhold until recovery to Grade <=1, then resume at reduced dose of 150 mg.',
          },
          {
            id: 'preparation_instructions',
            label: 'Preparation / Reconstitution Instructions',
            type: 'textarea',
            placeholder:
              'e.g., Reconstitute each vial with 10 mL Sterile Water for Injection. Swirl gently; do not shake. The reconstituted solution should be clear and colorless to pale yellow.',
            helpText:
              'Required for products that need reconstitution, dilution, or compounding before administration. Must include diluent type, volume, compatibility, stability after reconstitution, and visual inspection criteria.',
          },
          {
            id: 'administration_instructions',
            label: 'Administration Instructions',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Administer as an intravenous infusion over 30 minutes. Do not administer as an IV push or bolus.',
            helpText:
              'Include route, rate, infusion duration, injection site, and any special precautions (e.g., use of in-line filter, PVC-free tubing).',
          },
          {
            id: 'missed_dose_guidance',
            label: 'Missed Dose Guidance',
            type: 'textarea',
            placeholder:
              'e.g., If a dose is missed, administer as soon as possible within 12 hours. If more than 12 hours have elapsed, skip the missed dose and resume the regular schedule.',
          },
        ],
        defaultNext: 'fpi_safety',
      },

      {
        id: 'fpi_safety',
        section: 'fpi',
        question:
          'Provide the safety information for the Full Prescribing Information, including Contraindications (Section 4), Warnings and Precautions (Section 5), Adverse Reactions (Section 6), and Drug Interactions (Section 7).',
        guidance:
          'These sections constitute the core safety information in the USPI. Per 21 CFR 201.57(c)(5), Contraindications must list situations where the drug must NOT be used because the risk clearly outweighs any benefit. Per 21 CFR 201.57(c)(6), Warnings and Precautions must describe clinically significant adverse reactions and safety hazards, with practical guidance for monitoring and management. Per 21 CFR 201.57(c)(7), Adverse Reactions must present adverse event data from clinical trials and post-marketing experience. Per 21 CFR 201.57(c)(8), Drug Interactions must describe clinically meaningful interactions. Reference: FDA Guidance "Adverse Reactions Section of Labeling" (2019); ICH E2C(R2) for post-marketing data integration.',
        fields: [
          {
            id: 'contraindications',
            label: 'Contraindications (Section 4)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., [PRODUCT] is contraindicated in patients with known severe hypersensitivity to [active ingredient] or any excipient.',
            validation: { minLength: 30 },
          },
          {
            id: 'contraindication_basis',
            label: 'Basis for Each Contraindication',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Hypersensitivity: Based on post-marketing reports of anaphylaxis (n=12 reports, FAERS database). Concomitant strong CYP3A4 inducer: Based on PK interaction study (Study ABC-101).',
            helpText:
              'Per 21 CFR 201.57(c)(5), each contraindication must be based on specific clinical or pharmacologic evidence. Avoid listing contraindications without supporting data.',
          },
          {
            id: 'warnings_precautions',
            label: 'Warnings and Precautions (Section 5) — List Each Warning',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., 5.1 Hepatotoxicity: Fatal and serious hepatotoxicity has occurred. Monitor LFTs monthly for the first 6 months.\n5.2 QT Prolongation: Avoid in patients with baseline QTcF >470 ms.',
            validation: { minLength: 100 },
            helpText:
              'Organize by subsection (5.1, 5.2, etc.). Each warning should describe the risk, population at risk, monitoring recommendations, and management (dose modification or discontinuation criteria). Per 21 CFR 201.57(c)(6), warnings must include actionable clinical guidance.',
          },
          {
            id: 'adverse_reactions_clinical_trials',
            label: 'Adverse Reactions — Clinical Trials Experience (Section 6.1)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., In pooled Phase 2/3 trials (N=1,200), the most common adverse reactions (>=10%) were: nausea (32%), fatigue (28%), diarrhea (22%), rash (15%). Serious adverse reactions occurred in 18% of patients.',
            validation: { minLength: 100 },
            helpText:
              'Present adverse reactions by frequency (very common >=10%, common >=1%, uncommon >=0.1%, rare >=0.01%). Include the safety population size, study design, and comparison to placebo/active control. Reference: ICH E3 Section 12; FDA Guidance "Adverse Reactions Section" (2019).',
          },
          {
            id: 'adverse_reactions_post_marketing',
            label: 'Adverse Reactions — Post-marketing Experience (Section 6.2)',
            type: 'textarea',
            placeholder:
              'e.g., The following adverse reactions have been identified during post-approval use: Stevens-Johnson syndrome, interstitial lung disease. Because these reactions are reported voluntarily, frequency cannot be reliably estimated.',
            helpText:
              'Per 21 CFR 201.57(c)(7), post-marketing adverse reactions should include a statement about the limitations of voluntary reporting. Include only events where a causal relationship is reasonably established.',
          },
          {
            id: 'drug_interactions',
            label: 'Drug Interactions (Section 7)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., 7.1 Strong CYP3A4 Inhibitors: Concomitant use increases [PRODUCT] exposure by 3-fold. Reduce dose to 50 mg.\n7.2 Strong CYP3A4 Inducers: Concomitant use decreases exposure by 80%. Avoid concomitant use.',
            validation: { minLength: 50 },
            helpText:
              'Per 21 CFR 201.57(c)(8), describe each clinically significant drug interaction with the clinical consequence, mechanism, and management recommendation. Reference: FDA Guidance "Clinical Drug Interaction Studies" (2020); FDA Drug Interaction Table (updated annually).',
          },
          {
            id: 'overdosage',
            label: 'Overdosage (Section 10)',
            type: 'textarea',
            placeholder:
              'e.g., In clinical trials, overdoses up to 600 mg (3x recommended dose) were reported. Symptoms included nausea and vomiting. No specific antidote exists. Treatment is supportive.',
            helpText:
              'Per 21 CFR 201.57(c)(11), describe signs/symptoms of overdose, laboratory findings, treatment including use of antidotes, and whether the drug is dialyzable.',
          },
        ],
        issueChecks: [
          {
            id: 'missing_drug_interaction_data',
            condition: { field: 'drug_interactions', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Drug Interaction Information Missing',
            message:
              'The Drug Interactions section (Section 7) is a required component of the USPI per 21 CFR 201.57(c)(8). Missing drug interaction data may lead to a Refuse to File determination or an Information Request from FDA.',
            reference: '21 CFR 201.57(c)(8); FDA Guidance "Clinical Drug Interaction Studies" (2020)',
          },
        ],
        defaultNext: 'fpi_clinical_studies',
        provideExpertFeedback: true,
      },

      {
        id: 'fpi_clinical_studies',
        section: 'fpi',
        question:
          'Provide the Clinical Studies section (Section 14 of the FPI). Describe the trials that support each approved indication, including study design, demographics, endpoints, and results.',
        guidance:
          'Per 21 CFR 201.57(c)(15), the Clinical Studies section must describe each adequate and well-controlled study that supports an approved indication. Include study design, patient population, demographics, primary and key secondary endpoints, and results with effect sizes and statistical significance. For oncology products, include Kaplan-Meier curves or hazard ratios as appropriate. For products with supplemental indications, present studies chronologically or by indication. Reference: ICH E3; FDA Guidance "Clinical Studies Section of Labeling" (2018).',
        fields: [
          {
            id: 'pivotal_trial_description',
            label: 'Pivotal Clinical Trial Description',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Study ABC-301 was a randomized, double-blind, placebo-controlled Phase 3 trial in 450 patients with moderate-to-severe [disease].',
            validation: { minLength: 100 },
          },
          {
            id: 'trial_demographics',
            label: 'Study Demographics',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Median age: 62 years (range 28-84). Male: 55%. White: 72%, Asian: 18%, Black/African American: 7%.',
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint and Results',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., The primary endpoint was overall response rate (ORR) per RECIST v1.1 by BICR. ORR was 45% (95% CI: 38-52%) vs 12% placebo (p<0.001).',
            validation: { minLength: 50 },
          },
          {
            id: 'secondary_endpoints',
            label: 'Key Secondary Endpoints and Results',
            type: 'textarea',
            placeholder:
              'e.g., Median PFS: 12.3 months vs 5.8 months (HR 0.52, 95% CI: 0.40-0.68, p<0.001). Median OS: Not reached vs 18.7 months (HR 0.69, 95% CI: 0.51-0.93, p=0.014).',
          },
          {
            id: 'additional_studies',
            label: 'Additional Supportive Studies',
            type: 'textarea',
            placeholder: 'Describe any additional studies (e.g., dose-ranging, supportive Phase 2, open-label extension) referenced in the labeling.',
          },
        ],
        defaultNext: 'specific_pops_pregnancy',
        provideExpertFeedback: true,
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 4 — Use in Specific Populations                        */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'specific_pops_pregnancy',
        section: 'specific_populations',
        question:
          'Provide information for the Use in Specific Populations sections, starting with pregnancy (Section 8.1) and lactation (Section 8.2). Note: The PLLR (Pregnancy and Lactation Labeling Rule) eliminated letter categories (A/B/C/D/X) and replaced them with descriptive summaries.',
        guidance:
          'The Pregnancy and Lactation Labeling Rule (PLLR, 79 FR 72064, effective June 30, 2015) fundamentally changed pregnancy labeling for prescription drugs. The former ABCDX letter categories were replaced with three subsections under Section 8: (8.1) Pregnancy, (8.2) Lactation, and (8.3) Females and Males of Reproductive Potential. Each subsection must include: a risk summary, clinical considerations, and data (human and/or animal). All prescription drugs approved after June 30, 2015 must use the PLLR format. Products approved before June 30, 2001 must convert by June 30, 2020. Reference: 21 CFR 201.57(c)(9)(i); FDA Guidance "Pregnancy, Lactation, and Reproductive Potential: Labeling for Human Prescription Drugs — Content and Format" (2020).',
        fields: [
          {
            id: 'pllr_format_used',
            label: 'Is pregnancy labeling in PLLR format (descriptive, not letter categories)?',
            type: 'yes_no',
            required: true,
            helpText:
              'All products approved after June 30, 2015 MUST use the PLLR descriptive format. Products still using A/B/C/D/X categories are non-compliant and must be updated.',
          },
          {
            id: 'pregnancy_risk_summary',
            label: 'Pregnancy Risk Summary (Section 8.1)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Based on animal data, [PRODUCT] may cause fetal harm when administered to a pregnant woman. In animal reproduction studies, administration of [PRODUCT] to pregnant rats during organogenesis resulted in [findings] at exposures approximately [X]-fold the human exposure at the recommended dose.',
            validation: { minLength: 50 },
          },
          {
            id: 'pregnancy_clinical_considerations',
            label: 'Pregnancy — Clinical Considerations',
            type: 'textarea',
            placeholder:
              'e.g., Disease-associated maternal and/or embryo/fetal risk: Women with [disease] may be at increased risk for [complications]. Advise females of reproductive potential to use effective contraception during treatment and for [X] weeks after the last dose.',
          },
          {
            id: 'pregnancy_data',
            label: 'Pregnancy — Data (Human and/or Animal)',
            type: 'textarea',
            placeholder:
              'e.g., Human Data: No adequate human data. Animal Data: In embryo-fetal development studies in rats, oral doses of [X] mg/kg/day resulted in [skeletal malformations/reduced fetal weight/resorptions] at exposures [Y]-fold the human AUC.',
          },
          {
            id: 'lactation_risk_summary',
            label: 'Lactation Risk Summary (Section 8.2)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., There are no data on the presence of [PRODUCT] or its metabolites in human milk, the effects on the breastfed infant, or the effects on milk production.',
          },
          {
            id: 'lactation_recommendation',
            label: 'Lactation Clinical Recommendation',
            type: 'select',
            required: true,
            options: [
              { value: 'advise_not_breastfeed', label: 'Advise not to breastfeed during treatment' },
              { value: 'breastfeed_caution', label: 'Use caution; weigh benefit vs risk' },
              { value: 'compatible', label: 'Compatible with breastfeeding' },
              { value: 'insufficient_data', label: 'Insufficient data to make recommendation' },
            ],
          },
          {
            id: 'reproductive_potential',
            label: 'Females and Males of Reproductive Potential (Section 8.3)',
            type: 'textarea',
            placeholder:
              'e.g., Contraception — Females: Advise females of reproductive potential to use effective contraception during treatment and for 6 months after the last dose. Infertility — Males: Based on animal studies, [PRODUCT] may impair male fertility.',
            helpText:
              'Per PLLR, this section addresses pregnancy testing recommendations, contraception requirements, and effects on fertility for both sexes.',
          },
        ],
        issueChecks: [
          {
            id: 'pllr_not_used',
            condition: { field: 'pllr_format_used', operator: 'eq', value: false },
            severity: 'critical',
            title: 'PLLR Format Not Used for Pregnancy Labeling',
            message:
              'The Pregnancy and Lactation Labeling Rule (PLLR, 79 FR 72064) requires all prescription drugs approved after June 30, 2015 to use the descriptive format. Products approved before 2001 must have converted by June 30, 2020. Using the legacy A/B/C/D/X letter categories is non-compliant and FDA will require conversion during any labeling supplement review.',
            reference: '21 CFR 201.57(c)(9); PLLR Final Rule (79 FR 72064, Dec 4, 2014)',
          },
        ],
        defaultNext: 'specific_pops_other',
        provideExpertFeedback: true,
      },

      {
        id: 'specific_pops_other',
        section: 'specific_populations',
        question:
          'Provide information for the remaining Use in Specific Populations subsections: Pediatric Use (8.4), Geriatric Use (8.5), Renal Impairment (8.6), and Hepatic Impairment (8.7).',
        guidance:
          'Per 21 CFR 201.57(c)(9), each special population subsection must describe the available data (or lack thereof), any differences in safety/efficacy, and dosing recommendations. Pediatric Use (8.4) must reference the pediatric studies conducted per PREA (Pediatric Research Equity Act) or any FDA-granted waivers/deferrals. Geriatric Use (8.5) must describe the extent of geriatric exposure in clinical trials and any age-related differences. Renal and hepatic impairment sections must provide dosing guidance based on PK studies per FDA Guidances on organ impairment (2020). Reference: 21 CFR 201.57(c)(9)(iv)-(vii); FDA Guidance "E7 Studies in Support of Special Populations: Geriatrics" (ICH E7).',
        fields: [
          {
            id: 'pediatric_use',
            label: 'Pediatric Use (Section 8.4)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., The safety and effectiveness of [PRODUCT] have been established in pediatric patients aged 12 years and older. Use in this age group is supported by evidence from [study], with additional PK data in adolescents.',
          },
          {
            id: 'pediatric_studies_status',
            label: 'Pediatric Study Status (PREA/PRV)',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Pediatric studies completed' },
              { value: 'deferred', label: 'Pediatric studies deferred (PREA deferral granted)' },
              { value: 'waived', label: 'Pediatric studies waived (PREA waiver granted)' },
              { value: 'ongoing', label: 'Pediatric studies ongoing (PMR/PMC)' },
              { value: 'not_applicable', label: 'Not applicable (adult-only disease)' },
            ],
            helpText:
              'Per PREA (21 USC 355c), all NDA/BLA applicants must submit pediatric study plans unless a waiver or deferral is granted. FDA tracks pediatric study requirements as PMRs.',
          },
          {
            id: 'geriatric_use',
            label: 'Geriatric Use (Section 8.5)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Of the 1,200 patients in clinical trials, 35% were >=65 years and 12% were >=75 years. No overall differences in safety or effectiveness were observed between older and younger patients.',
            helpText:
              'Per ICH E7 and 21 CFR 201.57(c)(9)(v), describe the number and proportion of geriatric subjects in clinical trials and any differences observed. State whether dosage adjustment is needed.',
          },
          {
            id: 'renal_impairment',
            label: 'Renal Impairment (Section 8.6)',
            type: 'textarea',
            placeholder:
              'e.g., In a dedicated renal impairment PK study, [PRODUCT] AUC increased by 40% in patients with severe renal impairment (eGFR 15-29 mL/min/1.73m2). No dose adjustment for mild-to-moderate impairment.',
            helpText:
              'Per FDA Guidance on Renal Impairment PK Studies (2020), include data categorized by eGFR or CrCl. Provide dosing recommendations for each severity category.',
          },
          {
            id: 'hepatic_impairment',
            label: 'Hepatic Impairment (Section 8.7)',
            type: 'textarea',
            placeholder:
              'e.g., In a dedicated hepatic impairment PK study using Child-Pugh classification, no dose adjustment is needed for mild (Child-Pugh A) impairment. Use with caution in moderate (Child-Pugh B). Avoid in severe (Child-Pugh C).',
            helpText:
              'Per FDA Guidance on Hepatic Impairment PK Studies (2020) and ICH E7, categorize by Child-Pugh A/B/C and provide specific dosing guidance.',
          },
        ],
        issueChecks: [
          {
            id: 'pediatric_section_incomplete',
            condition: { field: 'pediatric_studies_status', operator: 'eq', value: 'deferred' },
            severity: 'warning',
            title: 'Pediatric Studies Deferred — Labeling Must Reflect Deferral',
            message:
              'When pediatric studies are deferred under PREA, the Pediatric Use section must include a statement that the studies have been deferred, the deferral date, and the expected completion timeline. Failure to meet PREA PMR deadlines may result in FDA enforcement action per FDARA Section 505B(e).',
            reference: 'PREA (21 USC 355c); FDARA Section 505B(e); FDA PREA Guidance (2020)',
          },
        ],
        defaultNext: 'patient_med_guide',
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 5 — Device Labeling (devices only)                     */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'device_label_content',
        section: 'device_labeling',
        question:
          'Provide the required device labeling content per 21 CFR 801. Medical device labels must include specific information for safe and effective use.',
        guidance:
          'Per 21 CFR 801.1, device labeling encompasses the label itself and all accompanying materials (IFU, patient guides, quick reference cards). 21 CFR 801.5 requires adequate directions for use. 21 CFR 801.109 allows prescription device labeling to omit patient-directed information if the device is for professional use only. The UDI (Unique Device Identifier) rule (21 CFR 801.20) requires UDI on device labels and packages for Class II and III devices. Symbols used on medical device labeling should conform to ISO 15223-1 "Medical devices — Symbols to be used with information to be supplied by the manufacturer." Reference: 21 CFR 801; FDA Guidance "Unique Device Identification: Policy Regarding Compliance Dates for Class I and Unclassified Devices" (2018); ISO 15223-1:2021.',
        fields: [
          {
            id: 'device_class',
            label: 'Device Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I (General Controls)' },
              { value: 'class_ii', label: 'Class II (Special Controls / 510(k))' },
              { value: 'class_iii', label: 'Class III (PMA)' },
            ],
          },
          {
            id: 'device_name',
            label: 'Device Trade Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., CardioMonitor Pro 3000',
          },
          {
            id: 'device_common_name',
            label: 'Device Common / Generic Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., Electrocardiograph, single channel',
            helpText: 'The common name as listed in the FDA Product Classification database (21 CFR 801.1(d)).',
          },
          {
            id: 'intended_use',
            label: 'Intended Use / Indications for Use',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., The [Device Name] is intended for use in the non-invasive measurement of [parameter] in adult and pediatric patients in clinical settings.',
            validation: { minLength: 50 },
          },
          {
            id: 'udi_on_label',
            label: 'Is a UDI (Unique Device Identifier) included on the label?',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 801.20, most medical devices must bear a UDI on the device label and packages. The UDI must include a Device Identifier (DI) issued by an FDA-accredited issuing agency (GS1, HIBCC, or ICCBBA) and a Production Identifier (PI) with lot number, expiration date, manufacturing date, and serial number as applicable.',
          },
          {
            id: 'symbols_iso_15223',
            label: 'Are label symbols compliant with ISO 15223-1?',
            type: 'yes_no',
            required: true,
            helpText:
              'ISO 15223-1 defines internationally recognized symbols for medical device labeling (e.g., "use by," "lot number," "sterilization method," "single use"). Per FDA recognition of ISO 15223-1, these symbols may be used without adjacent text if they appear in the symbol glossary provided with the device.',
          },
          {
            id: 'mr_safety_labeling',
            label: 'MR Safety Labeling',
            type: 'select',
            options: [
              { value: 'mr_safe', label: 'MR Safe', description: 'No known hazards in all MR environments' },
              { value: 'mr_conditional', label: 'MR Conditional', description: 'Safe under specific MR conditions; conditions must be listed' },
              { value: 'mr_unsafe', label: 'MR Unsafe', description: 'Poses known hazards in all MR environments' },
              { value: 'not_applicable', label: 'Not applicable (no implantable/metallic components)' },
            ],
            helpText:
              'Per ASTM F2503-20 and FDA Guidance "Establishing Safety and Compatibility of Passive Implants in the Magnetic Resonance (MR) Environment" (2014), implantable and metallic devices must include MR safety labeling using the standardized MR Safe / MR Conditional / MR Unsafe icons.',
          },
          {
            id: 'sterilization_labeling',
            label: 'Sterilization Status on Label',
            type: 'select',
            options: [
              { value: 'sterile_eo', label: 'Sterile — Ethylene Oxide (EO)' },
              { value: 'sterile_radiation', label: 'Sterile — Radiation' },
              { value: 'sterile_steam', label: 'Sterile — Steam (autoclave)' },
              { value: 'sterile_aseptic', label: 'Sterile — Aseptic processing' },
              { value: 'non_sterile', label: 'Non-sterile' },
              { value: 'not_applicable', label: 'Not applicable' },
            ],
            helpText:
              'Per ISO 11607-1 and 21 CFR 801.1, sterile devices must indicate the sterilization method using the appropriate ISO 15223-1 symbol.',
          },
        ],
        issueChecks: [
          {
            id: 'device_no_udi',
            condition: { field: 'udi_on_label', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Device Missing UDI on Label',
            message:
              'Per the FDA UDI Rule (21 CFR 801.20), most Class II and Class III medical devices must bear a Unique Device Identifier on the label and device packages. Non-compliance may result in FDA Warning Letter or import refusal. Check if a UDI exception or alternative placement applies under 21 CFR 801.45.',
            reference: '21 CFR 801.20; 21 CFR 801.45; FDA UDI Guidance (2018)',
          },
          {
            id: 'device_symbols_not_compliant',
            condition: { field: 'symbols_iso_15223', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Label Symbols Not ISO 15223-1 Compliant',
            message:
              'Medical device label symbols should conform to ISO 15223-1 to ensure international recognition and reduce labeling errors. FDA recognizes ISO 15223-1 and recommends its use. Non-standard symbols require adjacent explanatory text.',
            reference: 'ISO 15223-1:2021; FDA Recognized Consensus Standards Database',
          },
        ],
        defaultNext: 'device_ifu',
        provideExpertFeedback: true,
      },

      {
        id: 'device_ifu',
        section: 'device_labeling',
        question:
          'Provide details about the Instructions for Use (IFU) and patient-directed labeling for the device.',
        guidance:
          'Per 21 CFR 801.5, device labeling must include adequate directions for use by the intended user (healthcare professional and/or patient). The IFU is the primary vehicle for conveying safe and effective use. For implantable devices, patient labeling (e.g., patient implant cards) is required per 21 CFR 801.57. IVD devices have additional labeling requirements under 21 CFR 809.10. Device labeling must also include warnings, precautions, storage conditions, and any applicable contraindications. Reference: 21 CFR 801.5; 21 CFR 801.109; 21 CFR 809.10; FDA Guidance "Instructions for Use — Patient Labeling for Medical Devices" (2001).',
        fields: [
          {
            id: 'ifu_user_type',
            label: 'Intended User of the IFU',
            type: 'select',
            required: true,
            options: [
              { value: 'professional_only', label: 'Healthcare professional only (Rx device, 21 CFR 801.109)' },
              { value: 'patient_use', label: 'Patient / lay user (OTC device)' },
              { value: 'both', label: 'Both professional and patient versions' },
            ],
          },
          {
            id: 'ifu_content_summary',
            label: 'IFU Content Summary — Key Sections Included',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'intended_use', label: 'Intended Use / Indications' },
              { value: 'contraindications', label: 'Contraindications' },
              { value: 'warnings', label: 'Warnings and Precautions' },
              { value: 'setup', label: 'Device Setup / Assembly' },
              { value: 'operation', label: 'Operation / Procedure Steps' },
              { value: 'maintenance', label: 'Maintenance / Cleaning / Reprocessing' },
              { value: 'troubleshooting', label: 'Troubleshooting' },
              { value: 'storage', label: 'Storage and Handling' },
              { value: 'disposal', label: 'Disposal / End of Life' },
              { value: 'specifications', label: 'Technical Specifications' },
              { value: 'emf_compliance', label: 'EMC / Electromagnetic Compatibility (IEC 60601-1-2)' },
            ],
          },
          {
            id: 'patient_implant_card',
            label: 'Is a patient implant card required and included?',
            type: 'yes_no',
            helpText:
              'Per 21 CFR 801.57, manufacturers of certain implantable devices must provide patient implant cards containing the device name, model/serial number, manufacturer information, and any conditions for MR safety.',
          },
          {
            id: 'ifu_languages',
            label: 'Languages Provided in the IFU',
            type: 'multi_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'spanish', label: 'Spanish' },
              { value: 'french', label: 'French' },
              { value: 'german', label: 'German' },
              { value: 'chinese', label: 'Chinese' },
              { value: 'japanese', label: 'Japanese' },
              { value: 'other', label: 'Other' },
            ],
            helpText:
              'For EU marketing, IFU must be provided in the official language(s) of the Member State(s) where the device is marketed per EU MDR Article 10(11). US FDA does not mandate non-English labeling but recommends it for patient-use devices in areas with significant non-English-speaking populations.',
          },
          {
            id: 'electronic_ifu',
            label: 'Is the IFU provided electronically (eIFU)?',
            type: 'yes_no',
            helpText:
              'Per FDA Guidance "Use of Electronic Labeling for Medical Devices" (2001) and EU MDR Regulation (EU) 2021/2226 on eIFU, electronic IFU may be permissible for professional-use devices if specific conditions are met. The device must indicate on the label that the IFU is available electronically.',
          },
        ],
        defaultNext: 'patient_med_guide',
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 6 — Patient Labeling                                   */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'patient_med_guide',
        section: 'patient_labeling',
        question:
          'Does this product require a Medication Guide, Patient Package Insert, or other patient-directed labeling? Address patient labeling requirements per 21 CFR Part 208.',
        guidance:
          'Per 21 CFR Part 208, a Medication Guide is required when FDA determines that: (1) patient labeling could help prevent serious adverse effects, (2) the product has serious risks relative to benefits that patients should know about, or (3) patient adherence to directions for use is crucial to the drug\'s effectiveness. Products with REMS that include a Medication Guide as an element to assure safe use must distribute the guide with each dispensing. OTC products may require a Consumer Medicine Information (CMI) sheet. Reference: 21 CFR Part 208; FDA Guidance "Medication Guides — Distribution Requirements and Inclusion in REMS" (2011); FDA Guidance "Useful Written Consumer Medication Information (CMI)" (2006).',
        fields: [
          {
            id: 'medication_guide_required',
            label: 'Is a Medication Guide required (21 CFR Part 208)?',
            type: 'yes_no',
            required: true,
            helpText:
              'FDA requires Medication Guides for products with specific safety concerns. Check the FDA Medication Guides webpage for the current list. If the product has a REMS with a Medication Guide element, it must be distributed with each dispensing per 21 CFR 208.24.',
          },
          {
            id: 'rems_includes_med_guide',
            label: 'Is there a REMS that requires a Medication Guide as an ETASU?',
            type: 'yes_no',
            required: true,
            helpText:
              'REMS (Risk Evaluation and Mitigation Strategy) may include a Medication Guide as an Element to Assure Safe Use (ETASU) per 21 USC 355-1(e). If yes, distribution and documentation requirements apply.',
          },
          {
            id: 'medication_guide_content',
            label: 'Medication Guide Content Summary',
            type: 'textarea',
            visibleWhen: {
              field: 'medication_guide_required',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'Summarize the key information included in the Medication Guide: What is [PRODUCT]? What are the important safety warnings? Who should not take [PRODUCT]? What are the possible side effects?',
            validation: { minLength: 50 },
          },
          {
            id: 'patient_package_insert',
            label: 'Is a Patient Package Insert (PPI) included?',
            type: 'yes_no',
            helpText:
              'PPIs are FDA-approved patient labeling typically included for specific drug classes (e.g., oral contraceptives, estrogen products). Unlike Medication Guides, PPIs are part of the approved product labeling.',
          },
          {
            id: 'pictograms_included',
            label: 'Are pictograms / visual aids included in patient labeling?',
            type: 'yes_no',
            helpText:
              'FDA encourages the use of pictograms in patient labeling to improve comprehension, especially for patients with limited literacy. Per USP <17> Prescription Container Labeling, pictograms should meet established readability standards.',
          },
          {
            id: 'readability_testing',
            label: 'Has readability/comprehension testing been conducted on patient labeling?',
            type: 'select',
            options: [
              { value: 'completed', label: 'Yes — Testing completed' },
              { value: 'planned', label: 'Planned but not yet conducted' },
              { value: 'not_planned', label: 'Not planned' },
              { value: 'not_applicable', label: 'Not applicable' },
            ],
            helpText:
              'FDA Guidance "Medication Guides" (2011) recommends readability testing of patient labeling to ensure comprehension at a 6th-to-8th grade reading level.',
          },
        ],
        issueChecks: [
          {
            id: 'no_med_guide_with_rems',
            condition: { field: 'rems_includes_med_guide', operator: 'eq', value: true },
            severity: 'critical',
            title: 'REMS Requires Medication Guide Distribution',
            message:
              'When a REMS includes a Medication Guide as an Element to Assure Safe Use (ETASU), the guide must be distributed to every patient with each dispensing. Failure to distribute constitutes a REMS violation, which may result in FDA enforcement action including Warning Letters, civil monetary penalties, and product seizure per 21 USC 355-1(i).',
            reference: '21 CFR Part 208; 21 USC 355-1(e); FDA REMS Guidance (2019)',
          },
        ],
        defaultNext: 'patient_counseling',
      },

      {
        id: 'patient_counseling',
        section: 'patient_labeling',
        question:
          'Provide the Patient Counseling Information section (Section 17 of the USPI). This section guides healthcare providers on what to discuss with patients.',
        guidance:
          'Per 21 CFR 201.57(c)(18), the Patient Counseling Information section must advise healthcare providers of information to convey to patients for safe and effective use. This includes: administration instructions, dosing schedule, missed dose instructions, storage conditions, potential adverse reactions to report, food/drug interactions, and referral to the Medication Guide or PPI if applicable. This section should be practical and patient-oriented. Reference: 21 CFR 201.57(c)(18); FDA Guidance "Patient Counseling Information Section of Labeling" (2018).',
        fields: [
          {
            id: 'patient_counseling_info',
            label: 'Patient Counseling Information Summary',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Advise patients to: (1) Report symptoms of hepatotoxicity (jaundice, dark urine, fatigue). (2) Take with food. (3) Use effective contraception during treatment. (4) Read the Medication Guide before starting treatment.',
            validation: { minLength: 50 },
          },
          {
            id: 'med_guide_reference',
            label: 'Does Section 17 reference the Medication Guide / PPI?',
            type: 'yes_no',
            helpText:
              'Per 21 CFR 201.57(c)(18), if a Medication Guide or PPI exists, Section 17 must instruct the healthcare provider to discuss the contents with the patient and ensure they receive a copy.',
          },
          {
            id: 'multilingual_patient_labeling',
            label: 'Is patient labeling available in languages other than English?',
            type: 'yes_no',
            helpText:
              'While FDA does not require non-English patient labeling for US marketing, providing Spanish and other language versions is recommended for health literacy and equity. Many states require Spanish-language pharmacy labeling.',
          },
          {
            id: 'key_counseling_topics',
            label: 'Key Counseling Topics Covered',
            type: 'multi_select',
            options: [
              { value: 'administration', label: 'Administration instructions' },
              { value: 'storage', label: 'Storage and handling' },
              { value: 'adverse_reactions', label: 'Signs/symptoms of serious adverse reactions' },
              { value: 'drug_interactions', label: 'Concomitant medications to avoid' },
              { value: 'food_interactions', label: 'Food interactions' },
              { value: 'contraception', label: 'Contraception requirements' },
              { value: 'pregnancy', label: 'Pregnancy reporting' },
              { value: 'driving', label: 'Driving / operating machinery' },
              { value: 'alcohol', label: 'Alcohol use' },
              { value: 'missed_dose', label: 'Missed dose instructions' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_patient_counseling',
            condition: { field: 'patient_counseling_info', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Patient Counseling Information Missing',
            message:
              'Section 17 (Patient Counseling Information) is a required section of the USPI per 21 CFR 201.57(c)(18). This section must advise healthcare providers on what information to convey to patients. Missing patient counseling information may result in a labeling deficiency finding during FDA review.',
            reference: '21 CFR 201.57(c)(18)',
          },
        ],
        defaultNext: 'safety_letters',
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 7 — Safety Communication                               */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'safety_letters',
        section: 'safety_communication',
        question:
          'Has or will the company issue any safety communications related to this product? Address Dear Healthcare Provider letters, safety labeling changes, and risk communication strategies.',
        guidance:
          'Safety communications include Dear Healthcare Professional (DHCP) letters (also called "Dear Doctor" letters), FDA Drug Safety Communications, and company-initiated safety alerts. DHCP letters are regulated under 21 CFR 200.5 and FDA Guidance "Dear Health Care Provider Letters: Improving Communication of Important Safety Information" (2014). Safety Labeling Changes (SLCs) are submitted as CBE-0 supplements per 21 CFR 314.70(c)(6)(iii) for drugs or 21 CFR 601.12(f)(1) for biologics when new safety information emerges. MedWatch reporting is required under 21 CFR 314.80 (drugs) / 21 CFR 600.80 (biologics) / 21 CFR 803 (devices). Reference: FDA Guidance "DHCP Letters" (2014); 21 CFR 314.70(c)(6)(iii).',
        fields: [
          {
            id: 'dhcp_letter_issued',
            label: 'Has a Dear Healthcare Provider (DHCP) letter been issued for this product?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dhcp_letter_topic',
            label: 'DHCP Letter Topic(s)',
            type: 'textarea',
            visibleWhen: {
              field: 'dhcp_letter_issued',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., October 2024: DHCP letter regarding risk of serious hepatotoxicity — recommended enhanced LFT monitoring.',
          },
          {
            id: 'safety_labeling_change',
            label: 'Has a Safety Labeling Change (SLC) been submitted as CBE-0?',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 314.70(c)(6)(iii), a CBE-0 supplement may be submitted to add or strengthen a contraindication, warning, precaution, or adverse reaction based on new safety data. CBE-0 changes take effect immediately upon submission, without waiting for FDA approval.',
          },
          {
            id: 'slc_description',
            label: 'Safety Labeling Change Description',
            type: 'textarea',
            visibleWhen: {
              field: 'safety_labeling_change',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., Added new Warning (5.7): Progressive multifocal leukoencephalopathy (PML). Updated Adverse Reactions (6.2) with post-marketing PML cases.',
          },
          {
            id: 'fda_drug_safety_communication',
            label: 'Has FDA issued a Drug Safety Communication about this product?',
            type: 'yes_no',
          },
          {
            id: 'risk_communication_strategy',
            label: 'Risk Communication Strategy',
            type: 'multi_select',
            options: [
              { value: 'dhcp_letter', label: 'Dear Healthcare Provider letter' },
              { value: 'med_guide_update', label: 'Updated Medication Guide' },
              { value: 'rems_modification', label: 'REMS modification' },
              { value: 'patient_alert', label: 'Patient safety alert' },
              { value: 'professional_education', label: 'Healthcare professional education materials' },
              { value: 'press_release', label: 'Press release' },
              { value: 'medwatch', label: 'MedWatch safety alert' },
              { value: 'none', label: 'No additional risk communication planned' },
            ],
          },
        ],
        defaultNext: 'safety_post_marketing',
      },

      {
        id: 'safety_post_marketing',
        section: 'safety_communication',
        question:
          'Describe the post-marketing safety surveillance and reporting obligations for this product. Address MedWatch reporting, PSUR/PBRER submissions, and any signal detection activities.',
        guidance:
          'Post-marketing safety surveillance is mandatory under 21 CFR 314.80 (drugs), 21 CFR 600.80 (biologics), and 21 CFR 803 (devices). Serious and unexpected adverse experiences must be reported to FDA within 15 calendar days (expedited reports). Annual safety reports are required. For marketed drugs with international presence, Periodic Benefit-Risk Evaluation Reports (PBRERs, per ICH E2C(R2)) harmonize post-marketing safety reporting across regions. Signal detection using FAERS (FDA Adverse Event Reporting System) data is expected as part of pharmacovigilance obligations. Reference: 21 CFR 314.80; 21 CFR 600.80; 21 CFR 803; ICH E2C(R2); ICH E2E.',
        fields: [
          {
            id: 'medwatch_reporting_current',
            label: 'Are MedWatch/safety reporting systems in place and active?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'post_marketing_commitments',
            label: 'Post-Marketing Requirements (PMRs) or Commitments (PMCs) Related to Labeling',
            type: 'textarea',
            placeholder:
              'e.g., PMR 12345-1: Conduct a long-term cardiovascular outcomes trial (CVOT) and update labeling with results by 2027. PMC 12345-2: Submit pediatric PK study results and update Section 8.4.',
            helpText:
              'PMRs are legally required studies/clinical trials (per FDAAA Section 505(o)(3)). PMCs are studies the sponsor has agreed to conduct. Both may trigger labeling updates upon completion.',
          },
          {
            id: 'signal_detection_method',
            label: 'Signal Detection Methodology',
            type: 'multi_select',
            options: [
              { value: 'faers_review', label: 'FAERS database review' },
              { value: 'literature_monitoring', label: 'Scientific literature monitoring' },
              { value: 'disproportionality', label: 'Disproportionality analysis (PRR/ROR/EBGM)' },
              { value: 'active_surveillance', label: 'Active surveillance (Sentinel, registries)' },
              { value: 'solicited_reports', label: 'Solicited reports (patient support programs)' },
              { value: 'social_media', label: 'Social media / digital monitoring' },
            ],
            helpText:
              'Per ICH E2E, sponsors must have a systematic approach to signal detection. FDA uses the Sentinel System for active surveillance. Sponsors should complement passive (FAERS) reporting with active methods.',
          },
          {
            id: 'pbrer_submission',
            label: 'Are PSUR/PBRER submissions current?',
            type: 'select',
            options: [
              { value: 'current', label: 'Yes — Current with reporting schedule' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'not_applicable', label: 'Not applicable (US-only marketing)' },
            ],
            helpText:
              'Per ICH E2C(R2), PBRERs should be submitted at defined intervals (typically every 6 months for the first 2 years post-approval, then annually). PBRERs are required by EMA and other regulatory authorities; FDA accepts them as IND annual report supplements.',
          },
        ],
        issueChecks: [
          {
            id: 'no_medwatch_reporting',
            condition: { field: 'medwatch_reporting_current', operator: 'eq', value: false },
            severity: 'critical',
            title: 'MedWatch / Safety Reporting Not Active',
            message:
              'Post-marketing adverse experience reporting is a legal requirement under 21 CFR 314.80 (drugs), 21 CFR 600.80 (biologics), and 21 CFR 803 (devices). Failure to report serious adverse events within 15 calendar days can result in FDA Warning Letter, consent decree, or product withdrawal. Ensure pharmacovigilance systems are functional immediately.',
            reference: '21 CFR 314.80; 21 CFR 600.80; 21 CFR 803; FDAAA Section 505(o)',
          },
        ],
        defaultNext: 'reg_review_fda',
        provideExpertFeedback: true,
      },

      /* ══════════════════════════════════════════════════════════════════ */
      /*  Section 8 — Regulatory Review                                  */
      /* ══════════════════════════════════════════════════════════════════ */

      {
        id: 'reg_review_fda',
        section: 'regulatory_review',
        question:
          'Provide information about the FDA labeling review process, negotiation history, and any advisory committee input reflected in the labeling.',
        guidance:
          'FDA labeling is negotiated between the sponsor and the review division during the NDA/BLA review process. The Office of Prescription Drug Promotion (OPDP, formerly DDMAC) reviews promotional materials for consistency with approved labeling. The Division of Drug Information (DDI) provides public-facing labeling information. Advisory committee (AdCom) recommendations may influence labeling language, particularly for boxed warnings, REMS requirements, and indication scope. Per 21 CFR 314.105(c), FDA must approve labeling as part of the application approval. Reference: 21 CFR 314.105(c); FDA MAPP 7400.8 (Labeling Review); FDA Guidance "Questions and Answers on FDA\'s Adverse Event Reporting System (FAERS)" (2019).',
        fields: [
          {
            id: 'review_division',
            label: 'FDA Review Division',
            type: 'text',
            required: true,
            placeholder:
              'e.g., Division of Oncology 1, Office of Oncologic Diseases, CDER',
            helpText:
              'Identify the specific review division within CDER, CBER, or CDRH that reviewed/will review the labeling. The review division determines the therapeutic expertise applied to labeling negotiations.',
          },
          {
            id: 'labeling_negotiation_history',
            label: 'Labeling Negotiation History — Key FDA Feedback Points',
            type: 'textarea',
            placeholder:
              'e.g., FDA requested strengthening of the hepatotoxicity warning (W&P 5.3) during the PDUFA review cycle. FDA-requested addition of a Boxed Warning was negotiated to a Warnings and Precautions subsection based on low event rate.',
            helpText:
              'Document key labeling positions FDA took during the review and how they were resolved. This history informs future supplement strategies.',
          },
          {
            id: 'advisory_committee_input',
            label: 'Were Advisory Committee (AdCom) recommendations reflected in labeling?',
            type: 'select',
            required: true,
            options: [
              { value: 'yes_reflected', label: 'Yes — AdCom recommendations incorporated' },
              { value: 'partially', label: 'Partially — Some recommendations incorporated' },
              { value: 'no_adcom', label: 'No Advisory Committee meeting held' },
              { value: 'not_applicable', label: 'Not applicable' },
            ],
          },
          {
            id: 'adcom_labeling_impact',
            label: 'Describe AdCom Impact on Labeling (if applicable)',
            type: 'textarea',
            visibleWhen: {
              field: 'advisory_committee_input',
              operator: 'in',
              value: ['yes_reflected', 'partially'],
            },
            placeholder:
              'e.g., AdCom voted 8-4 in favor of approval but recommended a Boxed Warning for cardiovascular risk and mandatory REMS with Medication Guide. Both recommendations were incorporated into final labeling.',
          },
          {
            id: 'labeling_supplements_planned',
            label: 'Labeling Supplements Planned',
            type: 'textarea',
            placeholder:
              'e.g., sNDA for new indication (NSCLC first-line) planned Q3 2026. sBLA for pediatric expansion planned Q1 2027. CBE-30 for updated clinical pharmacology data planned Q4 2026.',
            helpText:
              'Labeling supplements are submitted per 21 CFR 314.70 (drugs) or 21 CFR 601.12 (biologics). Types include: Prior Approval (PA) supplements for new indications; CBE-30 for moderate changes; CBE-0 for safety labeling changes.',
          },
        ],
        defaultNext: 'reg_review_promotional',
        provideExpertFeedback: true,
      },

      {
        id: 'reg_review_promotional',
        section: 'regulatory_review',
        question:
          'Address promotional materials consistency with approved labeling, OPDP/APLB review, and any post-approval labeling commitments.',
        guidance:
          'All promotional materials must be consistent with and not broader than the approved labeling. OPDP (Office of Prescription Drug Promotion) within CDER reviews prescription drug promotional materials under 21 CFR 202.1. APLB (Advertising and Promotional Labeling Branch) within CBER reviews biologic promotional materials. CDRH reviews device promotional materials. Promotional materials that are false or misleading, or that broaden the indication beyond approved labeling, may result in Warning Letters (formerly "untitled letters") or enforcement action. Pre-approval promotional materials (pre-launch) are prohibited under 21 CFR 312.7. Reference: 21 CFR 202.1; 21 CFR 312.7; FDA Guidance "Presenting Risk Information in Prescription Drug and Medical Device Promotion" (2009).',
        fields: [
          {
            id: 'promotional_consistency_review',
            label: 'Have promotional materials been reviewed for consistency with approved labeling?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'opdp_aplb_submissions',
            label: 'OPDP/APLB Submissions — Promotional Materials Submitted',
            type: 'multi_select',
            options: [
              { value: 'launch_materials', label: 'Launch promotional materials (Form FDA 2253)' },
              { value: 'sales_aid', label: 'Sales aid / detail piece' },
              { value: 'journal_ad', label: 'Journal advertisement' },
              { value: 'direct_consumer', label: 'Direct-to-consumer (DTC) advertising' },
              { value: 'website', label: 'Product website' },
              { value: 'social_media', label: 'Social media content' },
              { value: 'medical_education', label: 'Medical education materials' },
              { value: 'none_yet', label: 'No materials submitted yet' },
            ],
            helpText:
              'Per 21 CFR 314.81(b)(3)(i), promotional materials for prescription drugs must be submitted to OPDP at the time of initial dissemination using Form FDA 2253. CBER requires submission to APLB.',
          },
          {
            id: 'opdp_warning_letters',
            label: 'Has OPDP/APLB issued any Warning/Untitled Letters for this product\'s promotion?',
            type: 'yes_no',
            helpText:
              'OPDP Warning Letters require immediate cessation of the violative promotion and corrective action. Untitled Letters address less serious violations. Both are publicly available on the FDA OPDP Warning Letters webpage.',
          },
          {
            id: 'opdp_warning_details',
            label: 'OPDP/APLB Warning Letter Details',
            type: 'textarea',
            visibleWhen: {
              field: 'opdp_warning_letters',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'e.g., OPDP Warning Letter dated March 2025 regarding broadening of indication in sales aid. Corrective action: Cease dissemination, send corrective DHCP letter.',
          },
          {
            id: 'risk_information_presentation',
            label: 'How is risk information presented in promotional materials?',
            type: 'multi_select',
            options: [
              { value: 'fair_balance', label: 'Fair balance of benefit and risk per 21 CFR 202.1(e)(5)' },
              { value: 'brief_summary', label: 'Brief summary (print ads)' },
              { value: 'major_statement', label: 'Major statement (broadcast ads)' },
              { value: 'adequate_provision', label: 'Adequate provision (broadcast ads)' },
              { value: 'isi', label: 'Important Safety Information (ISI) — digital/web' },
            ],
            helpText:
              'Per 21 CFR 202.1, promotional materials must present fair balance of benefit and risk. Print ads require a brief summary; broadcast ads require a major statement plus adequate provision for the full labeling.',
          },
          {
            id: 'post_approval_labeling_commitments',
            label: 'Any Remaining Post-Approval Labeling Commitments?',
            type: 'textarea',
            placeholder:
              'e.g., Commitment to update labeling with final OS data from Study XYZ-301 by Q2 2027. Commitment to submit revised Medication Guide with simplified language by Q4 2026.',
          },
        ],
        issueChecks: [
          {
            id: 'promotional_not_reviewed',
            condition: { field: 'promotional_consistency_review', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Promotional Materials Not Reviewed for Labeling Consistency',
            message:
              'All promotional materials must be consistent with approved labeling per 21 CFR 202.1 and not be false or misleading under Section 502(a) of the FD&C Act. Promotional materials that broaden indications, minimize risks, or make unsupported superiority claims may result in OPDP Warning Letters and required corrective action. Conduct a promotional review committee (PRC) review before dissemination.',
            reference: '21 CFR 202.1; Section 502(a) FD&C Act; FDA OPDP Guidance (2009)',
          },
          {
            id: 'opdp_warning_exists',
            condition: { field: 'opdp_warning_letters', operator: 'eq', value: true },
            severity: 'critical',
            title: 'OPDP/APLB Warning Letter on File',
            message:
              'An OPDP or APLB Warning Letter indicates FDA found promotional materials to be violative (false, misleading, lacking fair balance, or broadening the indication). This may trigger heightened FDA scrutiny of all subsequent promotional materials and require corrective action including corrective DHCP letters and cessation of violative promotion.',
            reference: '21 CFR 202.1; FD&C Act Sections 301(a), 502(a), 502(n)',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
