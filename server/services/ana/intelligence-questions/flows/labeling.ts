/**
 * Labeling flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through gathering the information needed to develop or
 * review drug or device labeling, covering product identification, labeling
 * type selection, indications & usage, dosage & administration,
 * contraindications, warnings/precautions, adverse reactions, drug
 * interactions, specific populations, and patient counseling information.
 *
 * 10 nodes, 5 sections, 70+ fields with branching for drug vs device
 * labeling types and region-specific format requirements.
 *
 * @module server/services/ana/intelligence-questions/flows/labeling
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createLabelingFlow(): FlowDefinition {
  return {
    id: 'labeling-v1',
    category: 'labeling',
    name: 'Labeling',
    description:
      'Drug or device labeling development and compliance review',
    clientTypes: [],
    entryNode: 'product_identification',
    estimatedMinutes: 40,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'product_info',
        label: 'Product Information',
        nodeIds: ['product_identification', 'labeling_type'],
      },
      {
        id: 'clinical_content',
        label: 'Clinical Content',
        nodeIds: [
          'indications_usage',
          'dosage_administration',
          'drug_dosage_details',
          'device_use_details',
        ],
      },
      {
        id: 'safety_content',
        label: 'Safety Content',
        nodeIds: ['contraindications', 'warnings_precautions', 'adverse_reactions'],
      },
      {
        id: 'interactions_populations',
        label: 'Interactions & Populations',
        nodeIds: ['drug_interactions', 'specific_populations'],
      },
      {
        id: 'patient_info',
        label: 'Patient Information',
        nodeIds: ['patient_counseling'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 1 — Product Information                                 */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'product_identification',
        section: 'Product Information',
        question:
          'Let\'s identify the product for labeling. What is the product name, active ingredient(s), product type, and regulatory status?',
        guidance:
          'Accurate product identification is the foundation of labeling. The proprietary (brand) name must not be misleading or too similar to other marketed products. The established (generic) name, dosage form, and route of administration must match the approved product specifications exactly. Regulatory status determines which labeling framework applies.',
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
              { value: 'small_molecule', label: 'Small Molecule Drug' },
              { value: 'biologic', label: 'Biologic' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'generic', label: 'Generic Drug' },
              { value: 'otc', label: 'OTC Drug' },
              { value: 'combination_product', label: 'Combination Product' },
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'ivd', label: 'In Vitro Diagnostic (IVD)' },
            ],
          },
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'injection', label: 'Injection' },
              { value: 'infusion', label: 'Infusion' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhalation', label: 'Inhalation' },
              { value: 'solution', label: 'Oral Solution' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'implant', label: 'Implant' },
              { value: 'device_na', label: 'N/A (Device)' },
            ],
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'intravenous', label: 'Intravenous' },
              { value: 'subcutaneous', label: 'Subcutaneous' },
              { value: 'intramuscular', label: 'Intramuscular' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhalation', label: 'Inhalation' },
              { value: 'transdermal', label: 'Transdermal' },
              { value: 'other', label: 'Other' },
              { value: 'device_na', label: 'N/A (Device)' },
            ],
          },
          {
            id: 'regulatory_status',
            label: 'Regulatory Status',
            type: 'select',
            required: true,
            options: [
              { value: 'approved', label: 'Approved / Marketed' },
              { value: 'pending_approval', label: 'Pending Approval' },
              { value: 'investigational', label: 'Investigational' },
              { value: 'supplemental', label: 'Supplemental Application' },
            ],
          },
          {
            id: 'application_number',
            label: 'Application Number',
            type: 'text',
            placeholder: 'e.g. NDA 209092, BLA 125514, 510(k) K201234',
          },
          {
            id: 'labeling_reason',
            label: 'Reason for Labeling Activity',
            type: 'select',
            required: true,
            options: [
              { value: 'initial_approval', label: 'Initial Approval' },
              { value: 'new_indication', label: 'New Indication' },
              { value: 'safety_update', label: 'Safety Labeling Update' },
              { value: 'annual_update', label: 'Annual / Periodic Update' },
              { value: 'plr_conversion', label: 'PLR Format Conversion' },
              { value: 'postmarket_requirement', label: 'Post-Market Requirement' },
            ],
          },
        ],
        defaultNext: 'labeling_type',
      },

      {
        id: 'labeling_type',
        section: 'Product Information',
        question:
          'What labeling format(s) are required and which geographic regions apply?',
        guidance:
          'Labeling format varies by region and product type. In the US, prescription drug labeling follows the Physician Labeling Rule (PLR) format per 21 CFR 201.56-57. The EU requires a Summary of Product Characteristics (SmPC) per QRD template. Device labeling follows 21 CFR 801 (US) or EU MDR Annex I. Selecting the correct format is critical for regulatory acceptance.',
        fields: [
          {
            id: 'labeling_format',
            label: 'Primary Labeling Format',
            type: 'select',
            required: true,
            helpText: 'Select the primary labeling document being developed.',
            options: [
              { value: 'uspi', label: 'USPI (US Prescribing Information / PLR)' },
              { value: 'pil', label: 'PIL (Patient Information Leaflet)' },
              { value: 'smpc', label: 'SmPC (Summary of Product Characteristics)' },
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'ifu', label: 'IFU (Instructions for Use)' },
              { value: 'device_label', label: 'Device Label (21 CFR 801 / MDR Annex I)' },
              { value: 'otc_drug_facts', label: 'OTC Drug Facts Label' },
            ],
          },
          {
            id: 'additional_labeling_documents',
            label: 'Additional Labeling Documents',
            type: 'multi_select',
            helpText: 'Select any additional labeling documents being prepared concurrently.',
            options: [
              { value: 'uspi', label: 'USPI' },
              { value: 'pil', label: 'PIL' },
              { value: 'smpc', label: 'SmPC' },
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'ifu', label: 'Instructions for Use' },
              { value: 'patient_wallet_card', label: 'Patient Wallet Card' },
              { value: 'rems_materials', label: 'REMS Materials' },
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
              { value: '21_cfr_201', label: '21 CFR 201 (Drug Labeling)' },
              { value: '21_cfr_801', label: '21 CFR 801 (Device Labeling)' },
              { value: 'plr_rule', label: 'PLR Rule (21 CFR 201.56-57)' },
              { value: 'eu_qrd_template', label: 'EU QRD Template' },
              { value: 'eu_mdr_annex_i', label: 'EU MDR 2017/745 Annex I' },
              { value: 'ich_m4', label: 'ICH M4 (CTD Module 1.3)' },
              { value: 'fda_sppl', label: 'FDA Structured Product Labeling (SPL)' },
            ],
          },
          {
            id: 'spl_submission_required',
            label: 'SPL Submission Required',
            type: 'yes_no',
            helpText: 'FDA requires labeling to be submitted in Structured Product Labeling (SPL) XML format via the FDA ESG.',
          },
          {
            id: 'rems_required',
            label: 'REMS Required',
            type: 'yes_no',
            helpText: 'Does this product have a Risk Evaluation and Mitigation Strategy that affects labeling?',
          },
        ],
        branches: [
          {
            when: { field: 'labeling_format', operator: 'in', value: ['device_label', 'ifu'] },
            goto: 'device_use_details',
          },
        ],
        defaultNext: 'indications_usage',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 2 — Clinical Content                                    */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'indications_usage',
        section: 'Clinical Content',
        question:
          'What are the approved or proposed indications and usage for this product?',
        guidance:
          'The Indications and Usage section is among the most scrutinized parts of labeling. It must precisely state the disease or condition the product is indicated for, the patient population, and any limitations of use. FDA reviews this section for overly broad claims, unsupported populations, and consistency with the approved clinical data. Include the specific clinical setting, line of therapy, and any required companion diagnostics.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'primary_indication',
            label: 'Primary Indication',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. Treatment of adult patients with locally advanced or metastatic non-small cell lung cancer...',
          },
          {
            id: 'additional_indications',
            label: 'Additional Indications',
            type: 'textarea',
            placeholder: 'List any additional approved or proposed indications',
          },
          {
            id: 'therapeutic_class',
            label: 'Therapeutic / Pharmacological Class',
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
              { value: 'adults', label: 'Adults (18+)' },
              { value: 'adolescents', label: 'Adolescents (12-17)' },
              { value: 'pediatric', label: 'Pediatric (<12)' },
              { value: 'geriatric', label: 'Geriatric (65+)' },
              { value: 'all_ages', label: 'All Ages' },
            ],
          },
          {
            id: 'line_of_therapy',
            label: 'Line of Therapy',
            type: 'select',
            options: [
              { value: 'first_line', label: 'First Line' },
              { value: 'second_line', label: 'Second Line' },
              { value: 'third_line_plus', label: 'Third Line or Later' },
              { value: 'adjuvant', label: 'Adjuvant' },
              { value: 'neoadjuvant', label: 'Neoadjuvant' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'companion_diagnostic',
            label: 'Companion Diagnostic Required',
            type: 'yes_no',
            helpText: 'Is a companion diagnostic test required for patient selection?',
          },
          {
            id: 'companion_diagnostic_details',
            label: 'Companion Diagnostic Details',
            type: 'textarea',
            placeholder: 'Name of the diagnostic test, biomarker, and approved testing platforms',
            visibleWhen: { field: 'companion_diagnostic', operator: 'eq', value: true },
          },
          {
            id: 'limitations_of_use',
            label: 'Limitations of Use',
            type: 'textarea',
            placeholder: 'e.g. Not indicated for use in patients who have previously received...',
            helpText: 'State any limitations, restrictions, or conditions on the approved use.',
          },
        ],
        defaultNext: 'dosage_administration',
      },

      {
        id: 'dosage_administration',
        section: 'Clinical Content',
        question:
          'What are the dosage and administration details?',
        guidance:
          'The Dosage and Administration section must provide sufficient detail for safe and effective use. Include the recommended dose, dosing schedule, dose modifications for toxicity, and preparation/administration instructions. For injectable products, reconstitution and dilution instructions are critical. FDA expects dose modification tables for products with narrow therapeutic indices or significant toxicity profiles.',
        fields: [
          {
            id: 'recommended_dose',
            label: 'Recommended Dose',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. 200 mg administered as an intravenous infusion over 30 minutes every 3 weeks',
          },
          {
            id: 'dose_strengths',
            label: 'Available Dose Strengths',
            type: 'text',
            required: true,
            placeholder: 'e.g. 50 mg/2 mL, 100 mg/4 mL',
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
              { value: 'custom', label: 'Custom Schedule' },
            ],
          },
          {
            id: 'dose_modifications',
            label: 'Dose Modifications',
            type: 'textarea',
            placeholder: 'Describe dose modification criteria for adverse reactions, organ impairment, or concomitant medications',
            helpText: 'Include dose reduction steps, hold criteria, and discontinuation criteria.',
          },
          {
            id: 'preparation_instructions',
            label: 'Preparation / Reconstitution Instructions',
            type: 'textarea',
            placeholder: 'Reconstitution, dilution, and preparation instructions',
          },
          {
            id: 'administration_instructions',
            label: 'Administration Instructions',
            type: 'textarea',
            required: true,
            placeholder: 'Step-by-step administration instructions including rate, route, and monitoring',
          },
          {
            id: 'duration_of_treatment',
            label: 'Duration of Treatment',
            type: 'text',
            placeholder: 'e.g. Until disease progression or unacceptable toxicity',
          },
          {
            id: 'renal_hepatic_adjustments',
            label: 'Renal / Hepatic Dose Adjustments',
            type: 'textarea',
            placeholder: 'Dose adjustments for renal or hepatic impairment',
          },
        ],
        defaultNext: 'drug_dosage_details',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Branch nodes — Drug vs Device specific details                  */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'drug_dosage_details',
        section: 'Clinical Content',
        question:
          'Let\'s capture the pharmacological details for the drug product labeling.',
        guidance:
          'Clinical pharmacology information supports the dosing recommendations and helps prescribers understand the drug\'s mechanism, pharmacokinetics, and metabolism. This information is derived from Phase I and clinical pharmacology studies. The mechanism of action should be concise and clinically relevant. PK parameters should include values from the target population.',
        fields: [
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the mechanism of action at the molecular/cellular level',
          },
          {
            id: 'pharmacodynamics',
            label: 'Pharmacodynamics',
            type: 'textarea',
            placeholder: 'Describe exposure-response relationships, QTc effects, and other PD data',
          },
          {
            id: 'pharmacokinetics_summary',
            label: 'Pharmacokinetics Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Absorption, distribution, metabolism, excretion (ADME) summary',
          },
          {
            id: 'cyp_interactions',
            label: 'CYP Enzyme Interactions',
            type: 'multi_select',
            helpText: 'Select CYP enzymes involved in metabolism or subject to inhibition/induction.',
            options: [
              { value: 'cyp3a4_substrate', label: 'CYP3A4 Substrate' },
              { value: 'cyp3a4_inhibitor', label: 'CYP3A4 Inhibitor' },
              { value: 'cyp3a4_inducer', label: 'CYP3A4 Inducer' },
              { value: 'cyp2d6_substrate', label: 'CYP2D6 Substrate' },
              { value: 'cyp2d6_inhibitor', label: 'CYP2D6 Inhibitor' },
              { value: 'cyp2c9_substrate', label: 'CYP2C9 Substrate' },
              { value: 'cyp2c19_substrate', label: 'CYP2C19 Substrate' },
              { value: 'pgp_substrate', label: 'P-gp Substrate' },
              { value: 'pgp_inhibitor', label: 'P-gp Inhibitor' },
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
              { value: 'take_on_empty_stomach', label: 'Take on Empty Stomach' },
              { value: 'high_fat_meal_effect', label: 'High-Fat Meal Effect (specify in text)' },
              { value: 'not_applicable', label: 'Not Applicable (Non-Oral)' },
            ],
          },
          {
            id: 'special_pk_populations',
            label: 'Special PK Populations Studied',
            type: 'multi_select',
            helpText: 'Select populations where PK was specifically evaluated.',
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
        defaultNext: 'contraindications',
      },

      {
        id: 'device_use_details',
        section: 'Clinical Content',
        question:
          'Let\'s capture device-specific labeling details.',
        guidance:
          'Device labeling under 21 CFR 801 and EU MDR Annex I Chapter III must include intended use, device description, performance characteristics, and instructions for use. UDI labeling requirements (21 CFR 830) apply to most devices. The Instructions for Use (IFU) must be clear enough for the intended user, whether that is a healthcare professional or a patient/layperson.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'device_description',
            label: 'Device Description',
            type: 'textarea',
            required: true,
            placeholder: 'Physical description, materials, components, and principles of operation',
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
            id: 'intended_use_environment',
            label: 'Intended Use Environment',
            type: 'select',
            required: true,
            options: [
              { value: 'hospital', label: 'Hospital / Clinical Setting' },
              { value: 'outpatient', label: 'Outpatient Clinic' },
              { value: 'home_use', label: 'Home Use' },
              { value: 'laboratory', label: 'Laboratory' },
              { value: 'multiple', label: 'Multiple Settings' },
            ],
          },
          {
            id: 'intended_user',
            label: 'Intended User',
            type: 'select',
            required: true,
            options: [
              { value: 'hcp', label: 'Healthcare Professional' },
              { value: 'patient', label: 'Patient / Layperson' },
              { value: 'both', label: 'Both HCP and Patient' },
              { value: 'lab_personnel', label: 'Laboratory Personnel' },
            ],
          },
          {
            id: 'udi_di',
            label: 'UDI-DI (Device Identifier)',
            type: 'text',
            placeholder: 'Unique Device Identifier - Device Identifier portion',
            helpText: 'Required per 21 CFR 830 for most devices.',
          },
          {
            id: 'performance_characteristics',
            label: 'Performance Characteristics',
            type: 'textarea',
            required: true,
            placeholder: 'Sensitivity, specificity, accuracy, or other relevant performance data',
          },
          {
            id: 'sterilization_info',
            label: 'Sterilization Information',
            type: 'select',
            options: [
              { value: 'sterile', label: 'Sterile (Single Use)' },
              { value: 'sterile_reusable', label: 'Sterile (Reprocessable)' },
              { value: 'non_sterile', label: 'Non-Sterile' },
              { value: 'user_sterilize', label: 'User Must Sterilize Before Use' },
            ],
          },
          {
            id: 'shelf_life_storage',
            label: 'Shelf Life and Storage Conditions',
            type: 'textarea',
            placeholder: 'Shelf life duration and required storage conditions',
          },
        ],
        issueChecks: [
          {
            id: 'home_use_hcp_only',
            condition: { field: 'intended_use_environment', operator: 'eq', value: 'home_use' },
            severity: 'warning',
            title: 'Home Use Labeling Requirements',
            message:
              'Devices intended for home use require labeling written at an appropriate literacy level (generally 6th-8th grade reading level). FDA recommends human factors testing for home-use device labeling. Ensure instructions are clear for layperson users.',
            reference: '21 CFR 801.4, FDA Guidance on Home Use Devices',
          },
        ],
        defaultNext: 'contraindications',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 3 — Safety Content                                      */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'contraindications',
        section: 'Safety Content',
        question:
          'What are the contraindications for this product?',
        guidance:
          'Contraindications describe situations in which the product should not be used because the risk clearly outweighs any possible benefit. FDA distinguishes between absolute contraindications (product must not be used) and situations better described as warnings. The Contraindications section should be concise and limited to true contraindications supported by clinical evidence or pharmacological rationale.',
        fields: [
          {
            id: 'contraindication_list',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
            placeholder: 'List each contraindication (e.g. severe hypersensitivity to the active substance, co-administration with strong CYP3A4 inducers)',
          },
          {
            id: 'contraindication_count',
            label: 'Number of Contraindications',
            type: 'number',
            required: true,
            validation: { min: 0, max: 50 },
          },
          {
            id: 'hypersensitivity_contraindication',
            label: 'Hypersensitivity Contraindication Included',
            type: 'yes_no',
            required: true,
            helpText: 'Most products include a contraindication for severe hypersensitivity to the active ingredient or excipients.',
          },
          {
            id: 'contraindication_evidence_basis',
            label: 'Evidence Basis',
            type: 'select',
            required: true,
            options: [
              { value: 'clinical_trial', label: 'Clinical Trial Data' },
              { value: 'pharmacological', label: 'Pharmacological Rationale' },
              { value: 'postmarket', label: 'Post-Market Experience' },
              { value: 'class_effect', label: 'Class Effect' },
              { value: 'combination', label: 'Combination of Sources' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_hypersensitivity',
            condition: { field: 'hypersensitivity_contraindication', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Missing Hypersensitivity Contraindication',
            message:
              'Most FDA-approved drug labeling includes a contraindication for severe hypersensitivity to the active ingredient or any excipient. Verify whether this product\'s safety profile supports omission of this standard contraindication.',
            reference: '21 CFR 201.57(c)(5)',
          },
        ],
        defaultNext: 'warnings_precautions',
      },

      {
        id: 'warnings_precautions',
        section: 'Safety Content',
        question:
          'What warnings and precautions should be included in the labeling?',
        guidance:
          'The Warnings and Precautions section describes clinically significant adverse reactions and safety hazards, along with steps to prevent or manage them. Boxed Warnings are reserved for the most serious risks that may lead to death or serious injury. FDA requires that each warning be supported by evidence and include actionable recommendations for the prescriber. The hierarchy is: Boxed Warning > Warnings and Precautions > Adverse Reactions.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'boxed_warning_required',
            label: 'Boxed Warning Required',
            type: 'yes_no',
            required: true,
            helpText: 'A Boxed Warning (Black Box Warning) is reserved for serious or life-threatening risks. FDA determines whether a Boxed Warning is required.',
          },
          {
            id: 'boxed_warning_text',
            label: 'Boxed Warning Text',
            type: 'textarea',
            placeholder: 'Full text of the proposed or approved Boxed Warning',
            visibleWhen: { field: 'boxed_warning_required', operator: 'eq', value: true },
          },
          {
            id: 'key_warnings',
            label: 'Key Warnings and Precautions',
            type: 'textarea',
            required: true,
            placeholder: 'List each warning with supporting evidence and management recommendations',
          },
          {
            id: 'warning_categories',
            label: 'Warning Categories',
            type: 'multi_select',
            required: true,
            helpText: 'Select all categories of warnings applicable to this product.',
            options: [
              { value: 'hepatotoxicity', label: 'Hepatotoxicity' },
              { value: 'cardiotoxicity', label: 'Cardiotoxicity / QT Prolongation' },
              { value: 'nephrotoxicity', label: 'Nephrotoxicity' },
              { value: 'immunosuppression', label: 'Immunosuppression / Infections' },
              { value: 'hemorrhage', label: 'Hemorrhage / Bleeding' },
              { value: 'teratogenicity', label: 'Embryo-Fetal Toxicity' },
              { value: 'hypersensitivity', label: 'Hypersensitivity / Anaphylaxis' },
              { value: 'cns_effects', label: 'CNS Effects' },
              { value: 'gi_effects', label: 'GI Perforation / Obstruction' },
              { value: 'dermatologic', label: 'Severe Dermatologic Reactions' },
              { value: 'endocrine', label: 'Endocrinopathies' },
              { value: 'infusion_reactions', label: 'Infusion-Related Reactions' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'monitoring_recommendations',
            label: 'Monitoring Recommendations',
            type: 'textarea',
            placeholder: 'Laboratory tests, vital signs, or other monitoring required before, during, or after treatment',
          },
          {
            id: 'rems_components',
            label: 'REMS Components',
            type: 'multi_select',
            helpText: 'If a REMS is required, select applicable components.',
            options: [
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'communication_plan', label: 'Communication Plan' },
              { value: 'etasu', label: 'ETASU (Elements to Assure Safe Use)' },
              { value: 'implementation_system', label: 'Implementation System' },
              { value: 'timetable', label: 'Timetable for Assessments' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'boxed_warning_no_rems',
            condition: { field: 'boxed_warning_required', operator: 'eq', value: true },
            severity: 'info',
            title: 'REMS Consideration for Boxed Warning Products',
            message:
              'Products with Boxed Warnings often require a REMS. If a REMS has not been proposed, verify with the regulatory team whether FDA has indicated one is needed. REMS requirements should be reflected in the labeling.',
            reference: '21 USC 355-1',
          },
        ],
        defaultNext: 'adverse_reactions',
      },

      {
        id: 'adverse_reactions',
        section: 'Safety Content',
        question:
          'What adverse reaction data should be included in the labeling?',
        guidance:
          'The Adverse Reactions section presents safety data from clinical trials and post-marketing experience. Per PLR format (21 CFR 201.57), it must include adverse reactions from adequate and well-controlled studies, organized by frequency and severity. Use the MedDRA preferred terms. Post-marketing adverse reactions should be reported when there is sufficient evidence of a causal relationship.',
        fields: [
          {
            id: 'clinical_trials_experience',
            label: 'Clinical Trials Experience Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize the safety database: number of patients exposed, treatment duration, and pivotal trial design',
          },
          {
            id: 'safety_database_size',
            label: 'Safety Database Size',
            type: 'number',
            required: true,
            helpText: 'Total number of patients exposed to the product in clinical trials.',
            validation: { min: 1 },
          },
          {
            id: 'serious_adverse_reactions',
            label: 'Serious Adverse Reactions',
            type: 'textarea',
            required: true,
            placeholder: 'List serious adverse reactions with incidence rates',
          },
          {
            id: 'common_adverse_reactions',
            label: 'Common Adverse Reactions (>=10%)',
            type: 'textarea',
            required: true,
            placeholder: 'List adverse reactions occurring in 10% or more of patients',
          },
          {
            id: 'discontinuation_rate',
            label: 'Discontinuation Due to Adverse Reactions',
            type: 'text',
            placeholder: 'e.g. 12% of patients discontinued due to adverse reactions',
          },
          {
            id: 'dose_modifications_for_ar',
            label: 'Dose Modifications for Adverse Reactions',
            type: 'textarea',
            placeholder: 'Summarize dose modification guidance tied to specific adverse reactions',
          },
          {
            id: 'postmarket_experience',
            label: 'Post-Marketing Experience',
            type: 'textarea',
            placeholder: 'Adverse reactions identified during post-approval use (if applicable)',
          },
          {
            id: 'immunogenicity_data',
            label: 'Immunogenicity Data',
            type: 'textarea',
            helpText: 'For biologics, include anti-drug antibody (ADA) incidence and clinical significance.',
          },
        ],
        issueChecks: [
          {
            id: 'small_safety_database',
            condition: { field: 'safety_database_size', operator: 'lt', value: 300 },
            severity: 'warning',
            title: 'Limited Safety Database',
            message:
              'A safety database of fewer than 300 patients may not adequately characterize the adverse reaction profile. ICH E1 recommends at least 300-600 patients for short-term treatments and 1500 for chronic-use products. Consider whether additional safety data collection is planned.',
            reference: 'ICH E1, FDA Safety Reporting Guidance',
          },
        ],
        defaultNext: 'drug_interactions',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 4 — Interactions & Populations                          */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'drug_interactions',
        section: 'Interactions & Populations',
        question:
          'What drug interactions should be described in the labeling?',
        guidance:
          'The Drug Interactions section describes clinically significant interactions and provides management recommendations. FDA expects interaction data from dedicated drug interaction studies, population PK analyses, and in vitro metabolism studies. Include both the effect of other drugs on the product and the effect of the product on other drugs. Reference the FDA Drug Interaction Guidance (2020) for study expectations.',
        fields: [
          {
            id: 'clinically_significant_interactions',
            label: 'Clinically Significant Interactions',
            type: 'textarea',
            required: true,
            placeholder: 'List each interacting drug or class with clinical effect and management recommendation',
          },
          {
            id: 'interaction_study_types',
            label: 'Drug Interaction Studies Conducted',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'in_vitro_cyp', label: 'In Vitro CYP Inhibition/Induction' },
              { value: 'in_vitro_transporter', label: 'In Vitro Transporter Studies' },
              { value: 'dedicated_clinical', label: 'Dedicated Clinical DDI Studies' },
              { value: 'population_pk', label: 'Population PK Analysis' },
              { value: 'pbpk_modeling', label: 'PBPK Modeling' },
            ],
          },
          {
            id: 'concomitant_use_contraindicated',
            label: 'Concomitant Use Contraindicated',
            type: 'textarea',
            placeholder: 'List drugs or drug classes whose concomitant use is contraindicated',
          },
          {
            id: 'dose_adjustment_interactions',
            label: 'Interactions Requiring Dose Adjustment',
            type: 'textarea',
            placeholder: 'List interactions that require dose modification and the recommended adjustment',
          },
          {
            id: 'food_interactions',
            label: 'Food and Beverage Interactions',
            type: 'textarea',
            placeholder: 'e.g. Grapefruit juice, St. John\'s Wort, alcohol',
          },
          {
            id: 'lab_test_interactions',
            label: 'Drug-Laboratory Test Interactions',
            type: 'textarea',
            placeholder: 'Describe any interference with laboratory tests',
          },
        ],
        defaultNext: 'specific_populations',
      },

      {
        id: 'specific_populations',
        section: 'Interactions & Populations',
        question:
          'What information should be included for use in specific populations?',
        guidance:
          'Section 8 of PLR labeling (Use in Specific Populations) must address pregnancy, lactation, females and males of reproductive potential, pediatric use, geriatric use, and renal/hepatic impairment per 21 CFR 201.57(c)(9). The Pregnancy and Lactation Labeling Rule (PLLR) eliminated pregnancy letter categories (A/B/C/D/X) for new labeling and requires a narrative description of risk. Include available human data, animal data, and pharmacokinetic considerations for each population.',
        fields: [
          {
            id: 'pregnancy_risk_summary',
            label: 'Pregnancy Risk Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Based on animal data, human data, or mechanism of action, describe the risk of use during pregnancy',
          },
          {
            id: 'pregnancy_data_source',
            label: 'Pregnancy Data Source',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'human_data', label: 'Human Data Available' },
              { value: 'animal_data', label: 'Animal Reproduction Studies' },
              { value: 'mechanism_based', label: 'Mechanism-Based Assessment' },
              { value: 'no_data', label: 'No Data Available' },
            ],
          },
          {
            id: 'lactation_risk',
            label: 'Lactation Risk Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Is the drug present in human milk? Effects on the breastfed infant? Effects on milk production?',
          },
          {
            id: 'reproductive_potential',
            label: 'Females and Males of Reproductive Potential',
            type: 'textarea',
            placeholder: 'Contraception requirements, infertility information, pregnancy testing recommendations',
          },
          {
            id: 'pediatric_use',
            label: 'Pediatric Use',
            type: 'textarea',
            required: true,
            placeholder: 'Safety and effectiveness in pediatric populations, or statement that it has not been established',
          },
          {
            id: 'geriatric_use',
            label: 'Geriatric Use',
            type: 'textarea',
            required: true,
            placeholder: 'Clinical study demographics for patients 65 and older, any age-related differences in safety or efficacy',
          },
          {
            id: 'renal_impairment',
            label: 'Renal Impairment',
            type: 'textarea',
            placeholder: 'Dosing recommendations or precautions for patients with renal impairment',
          },
          {
            id: 'hepatic_impairment',
            label: 'Hepatic Impairment',
            type: 'textarea',
            placeholder: 'Dosing recommendations or precautions for patients with hepatic impairment',
          },
        ],
        issueChecks: [
          {
            id: 'no_pregnancy_data',
            condition: { field: 'pregnancy_data_source', operator: 'contains', value: 'no_data' },
            severity: 'warning',
            title: 'No Pregnancy Data Available',
            message:
              'When no human or animal pregnancy data are available, labeling must state this clearly and advise on the background risk. The PLLR requires that the risk summary include the background rate of major birth defects and miscarriage for the indicated population.',
            reference: '21 CFR 201.57(c)(9)(i), PLLR Final Rule',
          },
        ],
        defaultNext: 'patient_counseling',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 5 — Patient Information                                  */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'patient_counseling',
        section: 'Patient Information',
        question:
          'What patient counseling information and patient-facing materials are needed?',
        guidance:
          'The Patient Counseling Information section advises healthcare providers on what to communicate to patients. Per 21 CFR 201.57(c)(18), this section must reference any FDA-approved patient labeling (Medication Guide or Patient Package Insert). Key counseling points should be actionable, plain-language summaries of the most important safety information. If a Medication Guide is required (21 CFR 208), it must be distributed with each dispensing.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'key_counseling_points',
            label: 'Key Counseling Points',
            type: 'textarea',
            required: true,
            placeholder: 'List the essential information healthcare providers should discuss with patients',
          },
          {
            id: 'medication_guide_required',
            label: 'Medication Guide Required',
            type: 'yes_no',
            required: true,
            helpText: 'A Medication Guide is required per 21 CFR 208 when FDA determines the drug poses a serious risk that can be mitigated by patient information.',
          },
          {
            id: 'patient_package_insert',
            label: 'Patient Package Insert Included',
            type: 'yes_no',
          },
          {
            id: 'literacy_level_target',
            label: 'Target Literacy Level',
            type: 'select',
            required: true,
            helpText: 'FDA recommends patient-facing materials be written at no higher than an 8th grade reading level.',
            options: [
              { value: '6th_grade', label: '6th Grade' },
              { value: '8th_grade', label: '8th Grade (FDA Recommended)' },
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
              { value: 'german', label: 'German' },
              { value: 'mandarin', label: 'Mandarin Chinese' },
              { value: 'japanese', label: 'Japanese' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'adherence_instructions',
            label: 'Adherence Instructions',
            type: 'textarea',
            placeholder: 'Instructions for missed doses, storage, and proper use',
          },
          {
            id: 'when_to_seek_medical_attention',
            label: 'When to Seek Medical Attention',
            type: 'textarea',
            required: true,
            placeholder: 'Symptoms or situations where the patient should seek immediate medical attention',
          },
          {
            id: 'disposal_instructions',
            label: 'Disposal Instructions',
            type: 'textarea',
            placeholder: 'Safe disposal instructions, especially for controlled substances or hazardous drugs',
          },
        ],
        issueChecks: [
          {
            id: 'high_literacy_level',
            condition: { field: 'literacy_level_target', operator: 'eq', value: '10th_grade' },
            severity: 'warning',
            title: 'Literacy Level May Be Too High',
            message:
              'FDA recommends patient-facing materials be written at no higher than an 8th grade reading level. Nearly half of US adults have limited health literacy. Consider revising to meet the 8th grade standard for broader patient comprehension.',
            reference: 'FDA Patient Labeling Guidance, IOM Health Literacy Report',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
