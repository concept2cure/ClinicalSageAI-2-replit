/**
 * 510(k) Premarket Notification flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through the information required for a 510(k) submission,
 * covering device information, predicate comparison, testing (performance,
 * standards, biocompatibility), clinical evidence, and submission preparation.
 *
 * @module server/services/ana/intelligence-questions/flows/device-510k
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createDevice510kFlow(): FlowDefinition {
  return {
    id: 'device-510k-v1',
    category: 'device_510k',
    name: '510(k) Premarket Notification',
    description:
      'Comprehensive questionnaire for 510(k) premarket notification submissions, covering device information, predicate device comparison, testing requirements, clinical evidence, and submission preparation.',
    clientTypes: ['medtech'],
    entryNode: 'device_basics',
    estimatedMinutes: 30,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'device_info',
        label: 'Device Information',
        nodeIds: ['device_basics', 'device_classification'],
      },
      {
        id: 'predicate',
        label: 'Predicate Device',
        nodeIds: ['predicate_info', 'se_comparison'],
      },
      {
        id: 'testing',
        label: 'Testing',
        nodeIds: ['performance_testing', 'standards_testing', 'biocompatibility'],
      },
      {
        id: 'clinical',
        label: 'Clinical Evidence',
        nodeIds: ['clinical_evidence'],
      },
      {
        id: 'submission_prep_section',
        label: 'Submission Preparation',
        nodeIds: ['submission_prep'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── Device Information ────────────────────────────────────────── */

      {
        id: 'device_basics',
        section: 'Device Information',
        question:
          'Let\'s start with the basic device information. What is the device name and who is the manufacturer?',
        guidance:
          'Accurate device identification is fundamental to the 510(k) submission. The trade name is the commercial name, while the common name is the generic descriptor used by FDA. The establishment registration number links to your FDA facility registration.',
        fields: [
          {
            id: 'device_trade_name',
            label: 'Device Trade Name',
            type: 'text',
            required: true,
          },
          {
            id: 'device_common_name',
            label: 'Device Common Name',
            type: 'text',
            required: true,
          },
          {
            id: 'manufacturer_name',
            label: 'Manufacturer Name',
            type: 'text',
            required: true,
          },
          {
            id: 'manufacturer_address',
            label: 'Manufacturer Address',
            type: 'textarea',
            required: true,
          },
          {
            id: 'establishment_registration_number',
            label: 'Establishment Registration Number',
            type: 'text',
          },
        ],
        defaultNext: 'device_classification',
      },

      {
        id: 'device_classification',
        section: 'Device Information',
        question:
          'What is the FDA classification for this device?',
        guidance:
          'The product code and regulation number determine the applicable FDA requirements. The 3-letter product code can be found in the FDA Product Classification Database. Device class affects the regulatory pathway and the level of evidence required.',
        fields: [
          {
            id: 'product_code',
            label: 'Product Code',
            type: 'text',
            required: true,
            helpText: 'FDA 3-letter product code',
          },
          {
            id: 'regulation_number',
            label: 'Regulation Number',
            type: 'text',
            required: true,
            placeholder: 'e.g. 21 CFR 880.xxxx',
          },
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
        ],
        issueChecks: [
          {
            id: 'class_iii_device_check',
            condition: { field: 'device_class', operator: 'eq', value: 'class_iii' },
            severity: 'critical',
            title: 'Class III Device',
            message:
              'Class III devices typically require PMA, not 510(k). Verify regulatory pathway.',
            reference: '21 CFR 860.3',
          },
        ],
        defaultNext: 'predicate_info',
      },

      /* ── Predicate Device ──────────────────────────────────────────── */

      {
        id: 'predicate_info',
        section: 'Predicate Device',
        question:
          'Identify the predicate device you are claiming substantial equivalence to.',
        guidance:
          'The predicate device is the legally marketed device to which you are comparing your new device. The predicate must have the same intended use and similar technological characteristics. The 510(k) number can be found in the FDA 510(k) database.',
        fields: [
          {
            id: 'predicate_device_name',
            label: 'Predicate Device Name',
            type: 'text',
            required: true,
          },
          {
            id: 'predicate_510k_number',
            label: 'Predicate 510(k) Number',
            type: 'text',
            required: true,
            placeholder: 'e.g. K123456',
          },
          {
            id: 'predicate_manufacturer',
            label: 'Predicate Manufacturer',
            type: 'text',
            required: true,
          },
          {
            id: 'same_intended_use',
            label: 'Same Intended Use',
            type: 'yes_no',
            required: true,
          },
        ],
        issueChecks: [
          {
            id: 'different_intended_use_check',
            condition: { field: 'same_intended_use', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Different Intended Use',
            message:
              'A different intended use from the predicate may require a De Novo classification instead of 510(k).',
            reference: 'FDA Guidance: The 510(k) Program',
          },
        ],
        defaultNext: 'se_comparison',
      },

      {
        id: 'se_comparison',
        section: 'Predicate Device',
        question:
          'Compare the technological characteristics and performance data between your device and the predicate.',
        guidance:
          'Substantial equivalence requires demonstrating that your device has the same intended use and either the same technological characteristics as the predicate, or different characteristics that do not raise new questions of safety or effectiveness. Provide a detailed side-by-side comparison.',
        fields: [
          {
            id: 'tech_characteristics_comparison',
            label: 'Technological Characteristics Comparison',
            type: 'textarea',
            required: true,
            helpText: 'Compare key technical specs between your device and the predicate',
          },
          {
            id: 'performance_data_comparison',
            label: 'Performance Data Comparison',
            type: 'textarea',
            required: true,
          },
          {
            id: 'same_tech_characteristics',
            label: 'Same Technological Characteristics',
            type: 'yes_no',
            required: true,
          },
        ],
        branches: [
          {
            when: { field: 'same_tech_characteristics', operator: 'eq', value: false },
            goto: 'performance_testing',
          },
        ],
        defaultNext: 'standards_testing',
      },

      /* ── Testing ───────────────────────────────────────────────────── */

      {
        id: 'performance_testing',
        section: 'Testing',
        question:
          'Since the technological characteristics differ from the predicate, describe the performance testing conducted.',
        guidance:
          'When technological characteristics differ from the predicate, performance data is needed to demonstrate that the differences do not raise new questions of safety or effectiveness. Include bench testing, animal testing (if applicable), and whether clinical data is required.',
        fields: [
          {
            id: 'performance_testing_summary',
            label: 'Performance Testing Summary',
            type: 'textarea',
            required: true,
          },
          {
            id: 'bench_testing_completed',
            label: 'Bench Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'animal_testing_completed',
            label: 'Animal Testing Completed',
            type: 'yes_no',
          },
          {
            id: 'clinical_data_required',
            label: 'Clinical Data Required',
            type: 'yes_no',
          },
        ],
        branches: [
          {
            when: { field: 'clinical_data_required', operator: 'eq', value: true },
            goto: 'clinical_evidence',
          },
        ],
        defaultNext: 'standards_testing',
      },

      {
        id: 'standards_testing',
        section: 'Testing',
        question:
          'Which recognized standards apply to your device, and what is the testing status?',
        guidance:
          'FDA recognizes consensus standards that can be used to support 510(k) submissions. Declaring conformity to recognized standards can streamline the review process. Select all applicable standards and indicate completion status.',
        fields: [
          {
            id: 'applicable_standards',
            label: 'Applicable Standards',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'iec_60601', label: 'IEC 60601 — Medical Electrical Equipment Safety' },
              { value: 'iso_10993', label: 'ISO 10993 — Biological Evaluation of Medical Devices' },
              { value: 'iso_13485', label: 'ISO 13485 — Quality Management Systems' },
              { value: 'iso_14971', label: 'ISO 14971 — Risk Management' },
              { value: 'iec_62304', label: 'IEC 62304 — Medical Device Software Lifecycle' },
              { value: 'iec_62366', label: 'IEC 62366 — Usability Engineering' },
              { value: 'iso_11607', label: 'ISO 11607 — Packaging for Terminally Sterilized Devices' },
            ],
          },
          {
            id: 'standards_testing_completed',
            label: 'Standards Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'electrical_safety_testing',
            label: 'Electrical Safety Testing',
            type: 'yes_no',
            visibleWhen: { field: 'applicable_standards', operator: 'contains', value: 'iec_60601' },
          },
          {
            id: 'software_level_of_concern',
            label: 'Software Level of Concern',
            type: 'select',
            options: [
              { value: 'minor', label: 'Minor' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'major', label: 'Major' },
            ],
            visibleWhen: { field: 'applicable_standards', operator: 'contains', value: 'iec_62304' },
          },
        ],
        defaultNext: 'biocompatibility',
      },

      {
        id: 'biocompatibility',
        section: 'Testing',
        question:
          'Does this device require biocompatibility testing?',
        guidance:
          'ISO 10993-1 provides a framework for biological evaluation of medical devices based on the nature and duration of patient contact. The evaluation should consider the device materials, contact type (surface, external communicating, or implant), and contact duration.',
        fields: [
          {
            id: 'biocompat_required',
            label: 'Biocompatibility Testing Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'iso_10993_evaluation_completed',
            label: 'ISO 10993 Evaluation Completed',
            type: 'yes_no',
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
          {
            id: 'patient_contact_type',
            label: 'Patient Contact Type',
            type: 'select',
            options: [
              { value: 'surface', label: 'Surface' },
              { value: 'external_communicating', label: 'External Communicating' },
              { value: 'implant', label: 'Implant' },
            ],
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
          {
            id: 'contact_duration',
            label: 'Contact Duration',
            type: 'select',
            options: [
              { value: 'limited', label: 'Limited (< 24 hours)' },
              { value: 'prolonged', label: 'Prolonged (24 hours – 30 days)' },
              { value: 'permanent', label: 'Permanent (> 30 days)' },
            ],
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'submission_prep',
      },

      /* ── Clinical Evidence ─────────────────────────────────────────── */

      {
        id: 'clinical_evidence',
        section: 'Clinical Evidence',
        question:
          'Describe the clinical evidence supporting this 510(k) submission.',
        guidance:
          'Clinical data may be required when performance testing alone cannot establish substantial equivalence, particularly when the device has different technological characteristics from the predicate or when the device contacts the patient in a new way. Describe the study type, size, endpoints, and results.',
        fields: [
          {
            id: 'clinical_study_type',
            label: 'Clinical Study Type',
            type: 'select',
            required: true,
            options: [
              { value: 'pivotal', label: 'Pivotal' },
              { value: 'literature', label: 'Literature' },
              { value: 'registry', label: 'Registry' },
              { value: 'post_market', label: 'Post-Market' },
            ],
          },
          {
            id: 'number_of_subjects',
            label: 'Number of Subjects',
            type: 'number',
            validation: { min: 1 },
          },
          {
            id: 'study_endpoints',
            label: 'Study Endpoints',
            type: 'textarea',
            required: true,
          },
          {
            id: 'clinical_results_summary',
            label: 'Clinical Results Summary',
            type: 'textarea',
            required: true,
          },
        ],
        defaultNext: 'submission_prep',
      },

      /* ── Submission Preparation ────────────────────────────────────── */

      {
        id: 'submission_prep',
        section: 'Submission Preparation',
        question:
          'Let\'s prepare the submission details. What type of 510(k) are you filing, and will it use the eSTAR format?',
        guidance:
          'FDA offers three types of 510(k) submissions: Traditional, Abbreviated (relying on guidance documents or special controls), and Special (for modifications to your own cleared device). As of October 2023, FDA requires all 510(k) submissions to use the eSTAR format.',
        fields: [
          {
            id: 'submission_type',
            label: 'Submission Type',
            type: 'select',
            required: true,
            options: [
              { value: 'traditional', label: 'Traditional' },
              { value: 'abbreviated', label: 'Abbreviated' },
              { value: 'special', label: 'Special' },
            ],
          },
          {
            id: 'target_submission_date',
            label: 'Target Submission Date',
            type: 'date',
          },
          {
            id: 'estar_format',
            label: 'eSTAR Format',
            type: 'yes_no',
            required: true,
            helpText: 'FDA requires eSTAR format for all 510(k) submissions',
          },
          {
            id: 'review_notes',
            label: 'Review Notes',
            type: 'textarea',
          },
        ],
        issueChecks: [
          {
            id: 'estar_required_check',
            condition: { field: 'estar_format', operator: 'eq', value: false },
            severity: 'critical',
            title: 'eSTAR Required',
            message:
              'As of October 2023, FDA requires all 510(k) submissions in eSTAR format.',
            reference: 'FDA: eSTAR Requirement',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
