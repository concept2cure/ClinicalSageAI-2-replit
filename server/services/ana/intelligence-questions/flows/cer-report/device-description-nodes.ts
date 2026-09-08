/**
 * Section 1 — Device Description & Classification — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/device-description-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const deviceDescriptionNodes: QuestionNode[] = [
  {
    id: 'cer_device_info',
    section: 'device_desc',
    question:
      'Let\'s begin with the device details. What is the device name, manufacturer, and current CE marking status?',
    guidance:
      'The CER must include a complete description of the device per MEDDEV 2.7/1 Rev 4 Section A1. Include the GMDN code for standardized nomenclature and the UDI-DI for traceability across the European market. Under EU MDR 2017/745, the CER must reference the device\'s classification per Annex VIII classification rules. The description should be sufficiently detailed that the device can be unambiguously identified, including all models, sizes, variants, and accessories covered by the CER scope. MDCG 2020-13 provides additional guidance on clinical evaluation scoping.',
    fields: [
      {
        id: 'cer_device_name',
        label: 'Device Name',
        type: 'text',
        required: true,
        helpText: 'The trade name or proprietary name of the device as it appears on the label',
      },
      {
        id: 'cer_manufacturer',
        label: 'Manufacturer',
        type: 'text',
        required: true,
        helpText: 'Legal manufacturer name and address as per EU MDR Article 2(30)',
      },
      {
        id: 'cer_authorized_representative',
        label: 'Authorized Representative in EU (if applicable)',
        type: 'text',
        helpText: 'Required for manufacturers established outside the EU per Article 11',
      },
      {
        id: 'ce_marking_status',
        label: 'CE Marking Status',
        type: 'select',
        required: true,
        options: [
          { value: 'not_applied', label: 'Not Applied' },
          { value: 'applied_pending', label: 'Applied — Pending' },
          { value: 'ce_marked_mdd', label: 'CE Marked (under MDD 93/42/EEC)' },
          { value: 'ce_marked_mdr', label: 'CE Marked (under EU MDR 2017/745)' },
          { value: 'transitioning', label: 'Transitioning MDD to MDR' },
        ],
      },
      {
        id: 'eu_mdr_class',
        label: 'EU MDR Device Classification',
        type: 'select',
        required: true,
        options: [
          { value: 'class_i', label: 'Class I' },
          { value: 'class_is', label: 'Class Is (Sterile)' },
          { value: 'class_im', label: 'Class Im (Measuring)' },
          { value: 'class_ir', label: 'Class Ir (Reusable Surgical Instruments)' },
          { value: 'class_iia', label: 'Class IIa' },
          { value: 'class_iib', label: 'Class IIb' },
          { value: 'class_iii', label: 'Class III' },
        ],
        helpText: 'Classification per EU MDR Annex VIII classification rules',
      },
      {
        id: 'classification_rule',
        label: 'Applicable Classification Rule(s)',
        type: 'text',
        helpText: 'EU MDR Annex VIII rule number(s) that determine the classification (e.g. Rule 8, Rule 13)',
      },
      {
        id: 'gmdn_code',
        label: 'GMDN Code',
        type: 'text',
        helpText: 'Global Medical Device Nomenclature code for standardized device identification',
      },
      {
        id: 'udi_di',
        label: 'UDI-DI',
        type: 'text',
        helpText: 'Unique Device Identification - Device Identifier per EUDAMED requirements',
      },
      {
        id: 'device_description_summary',
        label: 'Device Description Summary',
        type: 'textarea',
        required: true,
        helpText: 'Comprehensive description of the device including principles of operation, materials, components, accessories, and all variants/models covered by this CER. Per MEDDEV 2.7/1 Rev 4 Section A1.',
        validation: { minLength: 50 },
      },
      {
        id: 'is_implantable',
        label: 'Is the device implantable?',
        type: 'yes_no',
        required: true,
        helpText: 'Implantable as defined by EU MDR Article 2(5) — intended to be totally or partially introduced into the human body',
      },
      {
        id: 'is_novel_device',
        label: 'Is this a novel device with no established technology precedent?',
        type: 'yes_no',
        required: true,
        helpText: 'Novel devices require a more extensive state-of-the-art analysis and typically require clinical investigation data',
      },
      {
        id: 'notified_body_name',
        label: 'Notified Body',
        type: 'text',
        helpText: 'Name and NB number of the Notified Body (e.g. BSI 0086, TUV SUD 0123)',
      },
      {
        id: 'notified_body_feedback_received',
        label: 'Has Notified Body feedback been received on a prior CER submission?',
        type: 'yes_no',
      },
      {
        id: 'notified_body_feedback_summary',
        label: 'Summary of Notified Body Feedback',
        type: 'textarea',
        visibleWhen: { field: 'notified_body_feedback_received', operator: 'eq', value: true },
        helpText: 'Summarize key findings, deficiency letters, or questions raised by the Notified Body on prior CER reviews',
      },
      {
        id: 'cer_revision_number',
        label: 'CER Revision Number',
        type: 'text',
        helpText: 'Current revision of this CER (e.g. Rev 01, Rev 02)',
      },
      {
        id: 'cer_date',
        label: 'CER Date',
        type: 'date',
      },
    ],
    issueChecks: [
      {
        id: 'missing_notified_body_feedback_check',
        condition: { field: 'notified_body_feedback_received', operator: 'eq', value: false },
        severity: 'info',
        title: 'Missing Notified Body Feedback',
        message:
          'No Notified Body feedback has been received on a prior CER. While not required for an initial submission, addressing prior NB feedback is critical for CER updates and re-certifications. Consider proactively engaging the NB on the clinical evaluation approach for complex or novel devices.',
      },
    ],
    defaultNext: 'intended_purpose',
  },

  {
    id: 'intended_purpose',
    section: 'device_desc',
    question:
      'What is the intended purpose of this device, and who is the target patient population?',
    guidance:
      'The intended purpose is a critical element of the CER and determines the scope of clinical evaluation. Per EU MDR Article 2(12), the intended purpose includes the medical condition, target patient population, and clinical benefits. Contraindications must also be clearly identified. The intended purpose must be consistent with the labeling and IFU. Per MEDDEV 2.7/1 Rev 4 Section A1, the scope of the clinical evaluation is directly defined by the intended purpose. All claimed clinical benefits must be substantiated by clinical evidence in the CER.',
    fields: [
      {
        id: 'cer_intended_purpose',
        label: 'Intended Purpose',
        type: 'textarea',
        required: true,
        helpText: 'The intended purpose as stated in the labeling and IFU, consistent with EU MDR Article 2(12)',
        validation: { minLength: 30 },
      },
      {
        id: 'target_patient_population',
        label: 'Target Patient Population',
        type: 'textarea',
        required: true,
        helpText: 'Include age range, clinical condition, any exclusions. Identify any vulnerable populations (pediatric, pregnant, elderly).',
      },
      {
        id: 'medical_conditions_treated',
        label: 'Medical Conditions / Indications',
        type: 'textarea',
        required: true,
      },
      {
        id: 'claimed_clinical_benefits',
        label: 'Claimed Clinical Benefits',
        type: 'textarea',
        required: true,
        helpText: 'List all clinical benefits claimed for the device — each benefit must be supported by clinical evidence in the CER per EU MDR Annex XIV Part A. Distinguish between direct clinical benefits and indirect/performance benefits.',
        validation: { minLength: 30 },
      },
      {
        id: 'cer_contraindications',
        label: 'Contraindications',
        type: 'textarea',
      },
      {
        id: 'intended_users',
        label: 'Intended Users',
        type: 'multi_select',
        required: true,
        options: [
          { value: 'healthcare_professional', label: 'Healthcare Professional' },
          { value: 'patient_self_use', label: 'Patient (Self-Use)' },
          { value: 'caregiver', label: 'Caregiver / Lay Person' },
          { value: 'surgeon', label: 'Surgeon' },
          { value: 'nurse', label: 'Nurse' },
          { value: 'technician', label: 'Technician' },
          { value: 'radiologist', label: 'Radiologist' },
          { value: 'dentist', label: 'Dentist' },
        ],
      },
      {
        id: 'clinical_context',
        label: 'Clinical Context of Use',
        type: 'textarea',
        helpText: 'Describe the clinical setting and workflow in which the device is used (e.g. operating room, outpatient clinic, home use)',
      },
      {
        id: 'duration_of_use',
        label: 'Duration of Use',
        type: 'select',
        required: true,
        options: [
          { value: 'transient', label: 'Transient (< 60 minutes)' },
          { value: 'short_term', label: 'Short-term (up to 30 days)' },
          { value: 'long_term', label: 'Long-term (> 30 days)' },
          { value: 'permanent', label: 'Permanent (lifetime of patient)' },
        ],
        helpText: 'Duration of contact or intended functional period per EU MDR Annex VIII Chapter I',
      },
    ],
    defaultNext: 'device_classification_detail',
  },

  {
    id: 'device_classification_detail',
    section: 'device_desc',
    question:
      'Provide the detailed classification justification and regulatory pathway information.',
    guidance:
      'EU MDR Annex VIII contains 22 classification rules. The manufacturer must document which rule(s) apply and justify the resulting classification. For devices where multiple rules apply, the strictest classification prevails per Article 51(7). The classification determines the conformity assessment route (Annex IX, X, or XI) and the depth of clinical evidence required. MDCG 2021-24 provides guidance on classification of medical devices.',
    fields: [
      {
        id: 'classification_justification',
        label: 'Classification Justification',
        type: 'textarea',
        required: true,
        helpText: 'Explain why the selected classification rule(s) apply to this device. Reference specific criteria from Annex VIII.',
        validation: { minLength: 50 },
      },
      {
        id: 'invasiveness_type',
        label: 'Device Invasiveness',
        type: 'select',
        required: true,
        options: [
          { value: 'non_invasive', label: 'Non-Invasive' },
          { value: 'body_orifice', label: 'Invasive via Body Orifice' },
          { value: 'surgically_invasive', label: 'Surgically Invasive' },
          { value: 'implantable', label: 'Implantable' },
        ],
      },
      {
        id: 'active_device',
        label: 'Is the device an active medical device?',
        type: 'yes_no',
        required: true,
        helpText: 'Per EU MDR Article 2(4), any device whose operation depends on a source of energy other than human body or gravity',
      },
      {
        id: 'body_contact_type',
        label: 'Body Contact Type',
        type: 'multi_select',
        options: [
          { value: 'skin', label: 'Intact Skin' },
          { value: 'mucosal', label: 'Mucosal Membrane' },
          { value: 'breached_skin', label: 'Breached / Compromised Skin' },
          { value: 'blood_path', label: 'Blood Path (Indirect)' },
          { value: 'tissue_bone', label: 'Tissue / Bone' },
          { value: 'blood_direct', label: 'Blood (Direct Contact)' },
          { value: 'cns', label: 'Central Nervous System' },
          { value: 'cardiovascular', label: 'Central Cardiovascular System' },
        ],
      },
      {
        id: 'incorporates_medicinal_substance',
        label: 'Does the device incorporate a medicinal substance?',
        type: 'yes_no',
        helpText: 'Per EU MDR Article 1(8) and classification Rule 14',
      },
      {
        id: 'incorporates_biological_material',
        label: 'Does the device incorporate tissues or cells of human or animal origin?',
        type: 'yes_no',
        helpText: 'Per EU MDR Article 1(6) and Annex VIII Rule 18',
      },
      {
        id: 'device_variants_covered',
        label: 'Device Variants / Models Covered by This CER',
        type: 'textarea',
        helpText: 'List all variants, models, sizes, configurations covered. Justify why they can be grouped in a single CER.',
      },
      {
        id: 'previous_generation_devices',
        label: 'Previous Generation Devices',
        type: 'textarea',
        helpText: 'List any predecessor devices and summarize design changes. Clinical data from predecessors may be relevant if equivalence can be demonstrated.',
      },
    ],
    branches: [
      {
        when: { field: 'is_novel_device', operator: 'eq', value: true },
        goto: 'novel_device_assessment',
      },
    ],
    defaultNext: 'medical_alternatives',
  },
];
