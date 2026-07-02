/**
 * 510(k) Premarket Notification flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through the information required for a 510(k) submission,
 * covering device information, predicate comparison, testing (performance,
 * standards, biocompatibility), clinical evidence, submission preparation,
 * software documentation, sterilization & shelf life, labeling & usability,
 * and risk management & post-market surveillance.
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
      'Comprehensive questionnaire for 510(k) premarket notification submissions, covering device information, predicate device comparison, testing requirements, clinical evidence, submission preparation, software documentation (IEC 62304, cybersecurity), sterilization & shelf life, labeling & usability (human factors), and risk management & post-market surveillance.',
    clientTypes: ['medtech'],
    entryNode: 'device_basics',
    estimatedMinutes: 60,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'device_info',
        label: 'Device Information',
        nodeIds: ['device_basics', 'device_classification', 'device_materials'],
      },
      {
        id: 'predicate',
        label: 'Predicate Device',
        nodeIds: ['predicate_info', 'se_comparison'],
      },
      {
        id: 'testing',
        label: 'Testing',
        nodeIds: ['performance_testing', 'standards_testing', 'biocompatibility', 'emc_testing_detail', 'biocompat_detail'],
      },
      {
        id: 'clinical',
        label: 'Clinical Evidence',
        nodeIds: ['clinical_evidence'],
      },
      {
        id: 'submission_prep_section',
        label: 'Submission Preparation',
        nodeIds: ['submission_prep', 'quality_system_info'],
      },
      {
        id: 'software_doc',
        label: 'Software Documentation',
        nodeIds: ['software_classification', 'software_architecture_cybersecurity', 'software_vv'],
      },
      {
        id: 'sterilization_shelf_life',
        label: 'Sterilization & Shelf Life',
        nodeIds: ['sterilization', 'shelf_life_packaging'],
      },
      {
        id: 'labeling_usability',
        label: 'Labeling & Usability',
        nodeIds: ['labeling', 'usability_human_factors'],
      },
      {
        id: 'risk_postmarket',
        label: 'Risk Management & Post-Market',
        nodeIds: ['risk_management', 'post_market_surveillance', 'implant_specific'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── 1. Device Information ────────────────────────────────────── */

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
            placeholder: 'e.g. CardioMonitor Pro 3000',
          },
          {
            id: 'device_common_name',
            label: 'Device Common Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. Electrocardiograph',
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
            helpText: 'FDA facility registration number from FURLS',
          },
          {
            id: 'device_description',
            label: 'Device Description',
            type: 'textarea',
            required: true,
            helpText: 'Comprehensive description of the device, its components, accessories, and principles of operation',
            validation: { minLength: 50 },
          },
          {
            id: 'is_combination_product',
            label: 'Is this a combination product (device + drug/biologic)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'contains_software',
            label: 'Does the device contain or consist of software?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'is_sterile',
            label: 'Is the device provided sterile?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'is_implant',
            label: 'Is the device an implant?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'has_patient_contact',
            label: 'Does the device contact the patient?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'is_electronic',
            label: 'Is the device electronic or electrically powered?',
            type: 'yes_no',
            required: true,
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
          'The product code and regulation number determine the applicable FDA requirements. The 3-letter product code can be found in the FDA Product Classification Database. Device class affects the regulatory pathway and the level of evidence required. Panel information indicates the FDA review division.',
        fields: [
          {
            id: 'product_code',
            label: 'Product Code',
            type: 'text',
            required: true,
            helpText: 'FDA 3-letter product code (e.g. DQA, QKQ)',
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
          {
            id: 'review_panel',
            label: 'Review Panel',
            type: 'text',
            helpText: 'FDA advisory committee panel (e.g. Cardiovascular, Orthopedic)',
          },
          {
            id: 'device_intended_use',
            label: 'Intended Use / Indications for Use',
            type: 'textarea',
            required: true,
            helpText: 'The indications for use statement exactly as it will appear on the 510(k) Indications for Use form (FDA Form 3881)',
            validation: { minLength: 20 },
          },
          {
            id: 'prescription_otc',
            label: 'Prescription or OTC',
            type: 'radio',
            required: true,
            options: [
              { value: 'prescription', label: 'Prescription Use (Rx)' },
              { value: 'otc', label: 'Over-the-Counter (OTC)' },
              { value: 'both', label: 'Both Rx and OTC' },
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
              'Class III devices typically require PMA, not 510(k). Verify that a 510(k) pathway is available for this device type. Only certain Class III preamendment devices can use the 510(k) pathway.',
            reference: '21 CFR 860.3',
          },
        ],
        defaultNext: 'device_materials',
      },

      {
        id: 'device_materials',
        section: 'Device Information',
        question:
          'Describe the materials and components used in this device.',
        guidance:
          'A comprehensive materials list is required for the 510(k) submission, particularly for patient-contacting devices. Material specifications are critical for biocompatibility evaluation (ISO 10993-1), predicate comparison, and sterilization compatibility. Include all materials that contact the patient or are critical to device function.',
        fields: [
          {
            id: 'patient_contacting_materials',
            label: 'Patient-Contacting Materials',
            type: 'textarea',
            required: true,
            helpText: 'List all materials that directly or indirectly contact the patient (e.g. stainless steel 316L, silicone, PEEK, titanium alloy)',
          },
          {
            id: 'non_contacting_materials',
            label: 'Non-Patient-Contacting Materials',
            type: 'textarea',
            helpText: 'List structural and housing materials that do not contact the patient',
          },
          {
            id: 'material_specifications',
            label: 'Material Specifications / Standards',
            type: 'textarea',
            helpText: 'Reference applicable ASTM/ISO material standards (e.g. ASTM F138, ASTM F2026)',
          },
          {
            id: 'latex_free',
            label: 'Is the device latex-free?',
            type: 'yes_no',
            required: true,
            helpText: 'Latex must be declared per FDA labeling requirements if present',
          },
          {
            id: 'contains_dehp',
            label: 'Does the device contain DEHP or other phthalates?',
            type: 'yes_no',
            helpText: 'DEHP and phthalates require labeling per 21 CFR 801.437',
          },
          {
            id: 'mri_compatibility',
            label: 'MRI Compatibility',
            type: 'select',
            options: [
              { value: 'not_applicable', label: 'Not Applicable' },
              { value: 'mr_safe', label: 'MR Safe' },
              { value: 'mr_conditional', label: 'MR Conditional' },
              { value: 'mr_unsafe', label: 'MR Unsafe' },
              { value: 'not_tested', label: 'Not Tested' },
            ],
            helpText: 'Per ASTM F2503 — MRI labeling is required for implants',
          },
          {
            id: 'reprocessing_method',
            label: 'Reprocessing Method (if reusable)',
            type: 'select',
            options: [
              { value: 'not_applicable', label: 'Not Applicable (Single-Use)' },
              { value: 'autoclave', label: 'Autoclave / Steam' },
              { value: 'manual_cleaning', label: 'Manual Cleaning + Disinfection' },
              { value: 'automated_washer', label: 'Automated Washer/Disinfector' },
              { value: 'low_temp_sterilization', label: 'Low-Temperature Sterilization' },
            ],
          },
        ],
        defaultNext: 'predicate_info',
      },

      /* ── 2. Predicate Device ──────────────────────────────────────── */

      {
        id: 'predicate_info',
        section: 'Predicate Device',
        question:
          'Identify the predicate device you are claiming substantial equivalence to.',
        guidance:
          'The predicate device is the legally marketed device to which you are comparing your new device. The predicate must have the same intended use and similar technological characteristics. The 510(k) number can be found in the FDA 510(k) database. You may also identify additional reference devices that support your SE argument.',
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
            validation: {
              pattern: '^[Kk]\\d{6}$',
              patternMessage: '510(k) number must be in the format K followed by 6 digits',
            },
          },
          {
            id: 'predicate_manufacturer',
            label: 'Predicate Manufacturer',
            type: 'text',
            required: true,
          },
          {
            id: 'predicate_clearance_date',
            label: 'Predicate Clearance Date',
            type: 'date',
          },
          {
            id: 'same_intended_use',
            label: 'Same Intended Use as Predicate',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'additional_predicates',
            label: 'Additional Reference/Predicate Devices',
            type: 'textarea',
            helpText: 'List any additional reference devices used to support the SE argument (device name, 510(k) number)',
          },
        ],
        issueChecks: [
          {
            id: 'different_intended_use_check',
            condition: { field: 'same_intended_use', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Different Intended Use',
            message:
              'A different intended use from the predicate may require a De Novo classification instead of 510(k). Substantial equivalence fundamentally requires the same intended use.',
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
          'Substantial equivalence requires demonstrating that your device has the same intended use and either the same technological characteristics as the predicate, or different characteristics that do not raise new questions of safety or effectiveness. Provide a detailed side-by-side comparison covering materials, design, energy source, and other key specifications.',
        fields: [
          {
            id: 'tech_characteristics_comparison',
            label: 'Technological Characteristics Comparison',
            type: 'textarea',
            required: true,
            helpText: 'Compare key technical specs between your device and the predicate (materials, design, dimensions, energy source, etc.)',
            validation: { minLength: 50 },
          },
          {
            id: 'performance_data_comparison',
            label: 'Performance Data Comparison',
            type: 'textarea',
            required: true,
            helpText: 'Compare bench and/or clinical performance data between your device and the predicate',
          },
          {
            id: 'same_tech_characteristics',
            label: 'Same Technological Characteristics',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'new_materials',
            label: 'Does the device use new materials not present in the predicate?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'new_energy_source',
            label: 'Does the device use a different energy source or operating principle?',
            type: 'yes_no',
          },
          {
            id: 'se_summary',
            label: 'Substantial Equivalence Summary',
            type: 'textarea',
            required: true,
            helpText: 'Briefly summarize your argument for substantial equivalence',
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

      /* ── 3. Testing ───────────────────────────────────────────────── */

      {
        id: 'performance_testing',
        section: 'Testing',
        question:
          'Since the technological characteristics differ from the predicate, describe the performance testing conducted.',
        guidance:
          'When technological characteristics differ from the predicate, performance data is needed to demonstrate that the differences do not raise new questions of safety or effectiveness. Include bench testing, animal testing (if applicable), and whether clinical data is required. Testing should address each identified difference.',
        fields: [
          {
            id: 'performance_testing_summary',
            label: 'Performance Testing Summary',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'bench_testing_completed',
            label: 'Bench Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'bench_testing_description',
            label: 'Bench Testing Description',
            type: 'textarea',
            visibleWhen: { field: 'bench_testing_completed', operator: 'eq', value: true },
            helpText: 'Describe the bench tests performed and how they address the technological differences',
          },
          {
            id: 'animal_testing_completed',
            label: 'Animal Testing Completed',
            type: 'yes_no',
          },
          {
            id: 'animal_testing_description',
            label: 'Animal Testing Description',
            type: 'textarea',
            visibleWhen: { field: 'animal_testing_completed', operator: 'eq', value: true },
          },
          {
            id: 'clinical_data_required',
            label: 'Clinical Data Required to Address Differences',
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
          'Which recognized consensus standards apply to your device, and what is the testing status?',
        guidance:
          'FDA recognizes consensus standards that can be used to support 510(k) submissions. Declaring conformity to recognized standards can streamline the review process via Abbreviated 510(k). Select all applicable standards and indicate completion status. Use the FDA Recognized Consensus Standards database to identify applicable standards.',
        fields: [
          {
            id: 'applicable_standards',
            label: 'Applicable Recognized Consensus Standards',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'iec_60601_1', label: 'IEC 60601-1 — General Safety for Medical Electrical Equipment' },
              { value: 'iec_60601_1_2', label: 'IEC 60601-1-2 — Electromagnetic Compatibility (EMC)' },
              { value: 'iso_10993', label: 'ISO 10993 — Biological Evaluation of Medical Devices' },
              { value: 'iso_13485', label: 'ISO 13485 — Quality Management Systems' },
              { value: 'iso_14971', label: 'ISO 14971 — Risk Management' },
              { value: 'iec_62304', label: 'IEC 62304 — Medical Device Software Lifecycle' },
              { value: 'iec_62366_1', label: 'IEC 62366-1 — Usability Engineering' },
              { value: 'iso_11607', label: 'ISO 11607 — Packaging for Terminally Sterilized Devices' },
              { value: 'iso_11135', label: 'ISO 11135 — Sterilization by Ethylene Oxide' },
              { value: 'iso_11137', label: 'ISO 11137 — Sterilization by Radiation' },
              { value: 'iso_11737', label: 'ISO 11737 — Microbiological Methods / Bioburden' },
              { value: 'astm_f1980', label: 'ASTM F1980 — Accelerated Aging' },
              { value: 'iec_60529', label: 'IEC 60529 — Degrees of Protection (IP Code)' },
              { value: 'iso_15223', label: 'ISO 15223 — Symbols for Medical Device Labeling' },
            ],
          },
          {
            id: 'standards_testing_completed',
            label: 'All Standards Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'standards_testing_lab',
            label: 'Testing Laboratory',
            type: 'text',
            helpText: 'Name of the accredited testing laboratory (NVLAP, A2LA, etc.)',
          },
          {
            id: 'sdoc_declarations',
            label: 'Standards Declarations of Conformity (SDoC) Prepared',
            type: 'yes_no',
            helpText: 'Supplier\'s Declaration of Conformity per FDA format',
          },
          {
            id: 'electrical_safety_testing',
            label: 'IEC 60601-1 Electrical Safety Testing Completed',
            type: 'yes_no',
            visibleWhen: { field: 'applicable_standards', operator: 'contains', value: 'iec_60601_1' },
          },
          {
            id: 'emc_testing_completed',
            label: 'EMC Testing Completed (IEC 60601-1-2)',
            type: 'yes_no',
            visibleWhen: { field: 'applicable_standards', operator: 'contains', value: 'iec_60601_1_2' },
          },
        ],
        issueChecks: [
          {
            id: 'no_emc_electronic_check',
            condition: { field: 'emc_testing_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No EMC Testing for Electronic Device',
            message:
              'Electronic/electrically powered medical devices require electromagnetic compatibility testing per IEC 60601-1-2. Missing EMC data may result in an Additional Information (AI) request from FDA.',
            reference: 'IEC 60601-1-2:2014+AMD1:2020',
          },
        ],
        defaultNext: 'biocompatibility',
      },

      {
        id: 'biocompatibility',
        section: 'Testing',
        question:
          'Describe the biocompatibility evaluation for this device.',
        guidance:
          'ISO 10993-1 provides a framework for biological evaluation of medical devices based on the nature and duration of patient contact. The evaluation should consider the device materials, contact type (surface, external communicating, or implant), and contact duration. FDA\'s 2020 guidance on ISO 10993-1 emphasizes a risk-based approach and encourages chemical characterization before biological testing.',
        fields: [
          {
            id: 'biocompat_required',
            label: 'Biocompatibility Testing Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'iso_10993_evaluation_completed',
            label: 'ISO 10993-1 Biological Evaluation Completed',
            type: 'yes_no',
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
          {
            id: 'patient_contact_type',
            label: 'Patient Contact Type',
            type: 'select',
            required: true,
            options: [
              { value: 'no_contact', label: 'No Patient Contact' },
              { value: 'intact_skin', label: 'Intact Skin Surface' },
              { value: 'mucosal_membrane', label: 'Mucosal Membrane' },
              { value: 'breached_surface', label: 'Breached/Compromised Surface' },
              { value: 'external_communicating_blood_indirect', label: 'External Communicating — Blood Path, Indirect' },
              { value: 'external_communicating_tissue_bone', label: 'External Communicating — Tissue/Bone/Dentin' },
              { value: 'external_communicating_circulating_blood', label: 'External Communicating — Circulating Blood' },
              { value: 'implant_tissue_bone', label: 'Implant — Tissue/Bone' },
              { value: 'implant_blood', label: 'Implant — Blood' },
            ],
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
          {
            id: 'contact_duration',
            label: 'Contact Duration',
            type: 'select',
            options: [
              { value: 'limited', label: 'Limited (< 24 hours)' },
              { value: 'prolonged', label: 'Prolonged (24 hours - 30 days)' },
              { value: 'permanent', label: 'Permanent (> 30 days)' },
            ],
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
          {
            id: 'biocompat_tests_conducted',
            label: 'Biocompatibility Tests Conducted',
            type: 'multi_select',
            options: [
              { value: 'cytotoxicity', label: 'Cytotoxicity (ISO 10993-5)' },
              { value: 'sensitization', label: 'Sensitization (ISO 10993-10)' },
              { value: 'irritation', label: 'Irritation (ISO 10993-10)' },
              { value: 'systemic_toxicity', label: 'Systemic Toxicity (ISO 10993-11)' },
              { value: 'genotoxicity', label: 'Genotoxicity (ISO 10993-3)' },
              { value: 'implantation', label: 'Implantation (ISO 10993-6)' },
              { value: 'hemocompatibility', label: 'Hemocompatibility (ISO 10993-4)' },
              { value: 'chemical_characterization', label: 'Chemical Characterization (ISO 10993-18)' },
              { value: 'degradation', label: 'Degradation (ISO 10993-13/14/15)' },
              { value: 'chronic_toxicity', label: 'Chronic Toxicity (ISO 10993-11)' },
              { value: 'carcinogenicity', label: 'Carcinogenicity (ISO 10993-3)' },
              { value: 'reproductive_toxicity', label: 'Reproductive/Developmental Toxicity (ISO 10993-3)' },
            ],
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
          },
          {
            id: 'material_characterization',
            label: 'Material Chemical Characterization Completed',
            type: 'yes_no',
            visibleWhen: { field: 'biocompat_required', operator: 'eq', value: true },
            helpText: 'FDA encourages chemical characterization (ISO 10993-18) as a first step before biological testing',
          },
        ],
        issueChecks: [
          {
            id: 'prolonged_contact_full_biocompat_check',
            condition: { field: 'contact_duration', operator: 'in', value: ['prolonged', 'permanent'] },
            severity: 'critical',
            title: 'Extended Contact Duration Requires Full Biocompatibility',
            message:
              'Devices with patient contact >24 hours require a comprehensive biocompatibility evaluation including systemic toxicity, genotoxicity, and (for implants) implantation and chronic toxicity testing per ISO 10993-1 Table A.1.',
            reference: 'ISO 10993-1:2018, Table A.1',
          },
        ],
        branches: [
          {
            when: { field: 'is_electronic', operator: 'eq', value: true },
            goto: 'emc_testing_detail',
          },
          {
            when: { field: 'contact_duration', operator: 'in', value: ['prolonged', 'permanent'] },
            goto: 'biocompat_detail',
          },
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'software_classification',
          },
          {
            when: { field: 'is_sterile', operator: 'eq', value: true },
            goto: 'sterilization',
          },
        ],
        defaultNext: 'labeling',
      },

      {
        id: 'emc_testing_detail',
        section: 'Testing',
        question:
          'Provide details on electromagnetic compatibility (EMC) testing for this electronic device.',
        guidance:
          'Electronic medical devices must demonstrate electromagnetic compatibility per IEC 60601-1-2. This includes emissions testing (to ensure the device does not interfere with other equipment) and immunity testing (to ensure the device operates safely in the presence of electromagnetic disturbances). The 4th edition of IEC 60601-1-2 (2014) requires a risk-based EMC assessment.',
        fields: [
          {
            id: 'emc_standard_edition',
            label: 'IEC 60601-1-2 Edition Applied',
            type: 'select',
            required: true,
            options: [
              { value: 'edition_4', label: '4th Edition (2014) — Required for new submissions' },
              { value: 'edition_3', label: '3rd Edition (2007) — Legacy' },
            ],
          },
          {
            id: 'emissions_testing_completed',
            label: 'Emissions Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'immunity_testing_completed',
            label: 'Immunity Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'intended_electromagnetic_environment',
            label: 'Intended Electromagnetic Environment',
            type: 'select',
            required: true,
            options: [
              { value: 'professional_healthcare', label: 'Professional Healthcare Facility' },
              { value: 'home_healthcare', label: 'Home Healthcare Environment' },
              { value: 'special', label: 'Special Environment (e.g. MRI room, ambulance)' },
            ],
          },
          {
            id: 'wireless_technology',
            label: 'Wireless Technology Used',
            type: 'multi_select',
            options: [
              { value: 'bluetooth', label: 'Bluetooth / BLE' },
              { value: 'wifi', label: 'Wi-Fi' },
              { value: 'cellular', label: 'Cellular (4G/5G)' },
              { value: 'nfc', label: 'NFC' },
              { value: 'rfid', label: 'RFID' },
              { value: 'zigbee', label: 'Zigbee / Z-Wave' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'emc_risk_assessment',
            label: 'EMC Risk Assessment Completed (per 4th Edition)',
            type: 'yes_no',
            helpText: 'The 4th edition requires a risk-based approach to EMC testing',
          },
          {
            id: 'esd_protection',
            label: 'ESD Protection Level',
            type: 'text',
            placeholder: 'e.g. ±8kV contact, ±15kV air',
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'software_classification',
          },
          {
            when: { field: 'is_sterile', operator: 'eq', value: true },
            goto: 'sterilization',
          },
        ],
        defaultNext: 'labeling',
      },

      {
        id: 'biocompat_detail',
        section: 'Testing',
        question:
          'Provide detailed biocompatibility information for this extended-contact device.',
        guidance:
          'Devices with prolonged (>24 hours) or permanent contact require an expanded biological evaluation per ISO 10993-1 Table A.1. This typically includes systemic toxicity, subacute/subchronic toxicity, genotoxicity, and (for implants) implantation studies. FDA\'s 2020 guidance emphasizes using chemical characterization (ISO 10993-18) as a risk-based approach before conducting animal studies.',
        fields: [
          {
            id: 'biological_evaluation_plan',
            label: 'Biological Evaluation Plan (BEP) Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'Documented plan per ISO 10993-1 describing the biological evaluation strategy',
          },
          {
            id: 'chemical_characterization_results',
            label: 'Chemical Characterization Results Summary',
            type: 'textarea',
            required: true,
            helpText: 'Per ISO 10993-18 — extractables/leachables testing results and toxicological risk assessment',
          },
          {
            id: 'toxicological_risk_assessment',
            label: 'Toxicological Risk Assessment Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Comparison of extractable/leachable levels to established Tolerable Intake/Tolerable Contact levels',
          },
          {
            id: 'animal_testing_justified',
            label: 'Animal Testing Justified or Waived',
            type: 'select',
            required: true,
            options: [
              { value: 'required_completed', label: 'Required and Completed' },
              { value: 'required_planned', label: 'Required — Planned' },
              { value: 'waived_chemical', label: 'Waived Based on Chemical Characterization' },
              { value: 'waived_predicate', label: 'Waived Based on Predicate Equivalence' },
            ],
          },
          {
            id: 'biocompat_summary_report',
            label: 'Biocompatibility Summary Report Prepared',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'same_materials_as_predicate',
            label: 'Same Materials as Predicate Device',
            type: 'yes_no',
            helpText: 'If materials are identical to the predicate, biocompatibility data from the predicate may be leveraged',
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'software_classification',
          },
          {
            when: { field: 'is_sterile', operator: 'eq', value: true },
            goto: 'sterilization',
          },
        ],
        defaultNext: 'labeling',
      },

      /* ── 4. Clinical Evidence ──────────────────────────────────────── */

      {
        id: 'clinical_evidence',
        section: 'Clinical Evidence',
        question:
          'Describe the clinical evidence supporting this 510(k) submission.',
        guidance:
          'Clinical data may be required when performance testing alone cannot establish substantial equivalence, particularly when the device has different technological characteristics from the predicate or when the device contacts the patient in a new way. Describe the study type, size, endpoints, and results. Clinical data should follow FDA\'s guidance on clinical evidence for certain device types.',
        fields: [
          {
            id: 'clinical_study_type',
            label: 'Clinical Study Type',
            type: 'select',
            required: true,
            options: [
              { value: 'pivotal', label: 'Pivotal Clinical Study' },
              { value: 'feasibility', label: 'Feasibility / Pilot Study' },
              { value: 'literature', label: 'Literature-Based Evidence' },
              { value: 'registry', label: 'Registry Data' },
              { value: 'post_market', label: 'Post-Market Clinical Data' },
              { value: 'combined', label: 'Combined Sources' },
            ],
          },
          {
            id: 'ide_number',
            label: 'IDE Number (if applicable)',
            type: 'text',
            placeholder: 'e.g. G123456',
            helpText: 'Investigational Device Exemption number for significant risk studies',
          },
          {
            id: 'number_of_subjects',
            label: 'Number of Subjects Enrolled',
            type: 'number',
            validation: { min: 1 },
          },
          {
            id: 'study_design',
            label: 'Study Design',
            type: 'select',
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial' },
              { value: 'single_arm', label: 'Single-Arm / Single-Group' },
              { value: 'case_control', label: 'Case-Control' },
              { value: 'cohort', label: 'Cohort / Observational' },
              { value: 'crossover', label: 'Crossover' },
            ],
          },
          {
            id: 'study_endpoints',
            label: 'Primary and Secondary Endpoints',
            type: 'textarea',
            required: true,
            helpText: 'List primary and secondary endpoints with success criteria',
          },
          {
            id: 'clinical_results_summary',
            label: 'Clinical Results Summary',
            type: 'textarea',
            required: true,
          },
          {
            id: 'adverse_events_summary',
            label: 'Adverse Events Summary',
            type: 'textarea',
            helpText: 'Summarize the nature, frequency, and severity of adverse events observed',
          },
          {
            id: 'irb_approval',
            label: 'IRB / Ethics Committee Approval Obtained',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'submission_prep',
      },

      /* ── 5. Submission Preparation ─────────────────────────────────── */

      {
        id: 'submission_prep',
        section: 'Submission Preparation',
        question:
          'Let\'s prepare the submission details. What type of 510(k) are you filing, and will it use the eSTAR format?',
        guidance:
          'FDA offers three types of 510(k) submissions: Traditional, Abbreviated (relying on guidance documents or special controls), and Special (for modifications to your own cleared device). As of October 2023, FDA requires all 510(k) submissions to use the eSTAR format. The pre-submission (Q-Sub) meeting is strongly recommended for complex or novel devices.',
        fields: [
          {
            id: 'submission_type',
            label: 'Submission Type',
            type: 'select',
            required: true,
            options: [
              { value: 'traditional', label: 'Traditional 510(k)' },
              { value: 'abbreviated', label: 'Abbreviated 510(k)' },
              { value: 'special', label: 'Special 510(k)' },
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
            helpText: 'FDA requires eSTAR format for all 510(k) submissions as of October 2023',
          },
          {
            id: 'pre_submission_meeting',
            label: 'Pre-Submission (Q-Sub) Meeting Requested or Completed',
            type: 'select',
            options: [
              { value: 'not_planned', label: 'Not Planned' },
              { value: 'planned', label: 'Planned / Requested' },
              { value: 'completed', label: 'Completed' },
            ],
          },
          {
            id: 'pre_sub_feedback_summary',
            label: 'Pre-Submission Feedback Summary',
            type: 'textarea',
            visibleWhen: { field: 'pre_submission_meeting', operator: 'eq', value: 'completed' },
            helpText: 'Summarize key FDA feedback from the pre-submission meeting',
          },
          {
            id: 'third_party_review',
            label: 'Third-Party (Accredited Persons) Review',
            type: 'yes_no',
            helpText: 'Using an FDA-accredited third party for 510(k) review',
          },
          {
            id: 'review_notes',
            label: 'Additional Review Notes',
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
              'As of October 2023, FDA requires all 510(k) submissions in eSTAR format. Submissions not in eSTAR format will be placed on Refuse to Accept (RTA).',
            reference: 'FDA: eSTAR Requirement (October 2023)',
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'software_classification',
          },
          {
            when: { field: 'is_sterile', operator: 'eq', value: true },
            goto: 'sterilization',
          },
        ],
        defaultNext: 'quality_system_info',
      },

      {
        id: 'quality_system_info',
        section: 'Submission Preparation',
        question:
          'Describe the quality management system and design controls for this device.',
        guidance:
          'While the 510(k) submission does not require a full QMS audit, FDA may request evidence of design controls per 21 CFR 820.30 and quality system compliance. Design control documentation including design inputs, outputs, verification, validation, and design review records should be available. ISO 13485 certification demonstrates QMS compliance.',
        fields: [
          {
            id: 'iso_13485_certified',
            label: 'ISO 13485 Certified',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'iso_13485_registrar',
            label: 'ISO 13485 Registrar / Certification Body',
            type: 'text',
            visibleWhen: { field: 'iso_13485_certified', operator: 'eq', value: true },
          },
          {
            id: 'design_controls_21cfr820',
            label: 'Design Controls per 21 CFR 820.30 Documented',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'design_history_file',
            label: 'Design History File (DHF) Available',
            type: 'yes_no',
            required: true,
            helpText: 'The DHF contains all design control records for the device',
          },
          {
            id: 'design_verification_completed',
            label: 'Design Verification Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'design_validation_completed',
            label: 'Design Validation Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'design_transfer_completed',
            label: 'Design Transfer to Manufacturing Completed',
            type: 'yes_no',
          },
          {
            id: 'supplier_controls',
            label: 'Supplier Controls Established',
            type: 'yes_no',
            helpText: 'Per 21 CFR 820.50 — purchasing controls for critical suppliers',
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'software_classification',
          },
          {
            when: { field: 'is_sterile', operator: 'eq', value: true },
            goto: 'sterilization',
          },
        ],
        defaultNext: 'labeling',
      },

      /* ── 6. Software Documentation ─────────────────────────────────── */

      {
        id: 'software_classification',
        section: 'Software Documentation',
        question:
          'Let\'s document the software aspects of the device. What is the software classification and is this a Software as a Medical Device (SaMD)?',
        guidance:
          'FDA\'s 2023 guidance on Content of Premarket Submissions for Device Software Functions updates the documentation requirements based on IEC 62304 software safety classification. SaMD (Software as a Medical Device) has specific regulatory considerations under the IMDRF framework. The software safety classification (Class A, B, or C) determines the required level of documentation.',
        fields: [
          {
            id: 'is_samd',
            label: 'Is this Software as a Medical Device (SaMD)?',
            type: 'yes_no',
            required: true,
            helpText: 'Software that is itself a medical device, not part of a hardware medical device',
          },
          {
            id: 'samd_category',
            label: 'SaMD IMDRF Risk Category',
            type: 'select',
            visibleWhen: { field: 'is_samd', operator: 'eq', value: true },
            options: [
              { value: 'category_i', label: 'Category I (Lowest Risk)' },
              { value: 'category_ii', label: 'Category II' },
              { value: 'category_iii', label: 'Category III' },
              { value: 'category_iv', label: 'Category IV (Highest Risk)' },
            ],
          },
          {
            id: 'iec_62304_class',
            label: 'IEC 62304 Software Safety Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_a', label: 'Class A — No injury or damage to health is possible' },
              { value: 'class_b', label: 'Class B — Non-serious injury is possible' },
              { value: 'class_c', label: 'Class C — Death or serious injury is possible' },
            ],
          },
          {
            id: 'software_function_description',
            label: 'Software Function Description',
            type: 'textarea',
            required: true,
            helpText: 'Describe the clinical function the software performs and how it is used in the clinical workflow',
          },
          {
            id: 'software_version',
            label: 'Software Version',
            type: 'text',
            required: true,
          },
          {
            id: 'ai_ml_enabled',
            label: 'Does the software use AI/ML (Artificial Intelligence/Machine Learning)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'ai_ml_description',
            label: 'AI/ML Algorithm Description',
            type: 'textarea',
            visibleWhen: { field: 'ai_ml_enabled', operator: 'eq', value: true },
            helpText: 'Describe the AI/ML algorithm, training data, and predetermined change control plan if applicable',
          },
          {
            id: 'fda_software_guidance_followed',
            label: 'FDA 2023 Software Guidance Followed',
            type: 'yes_no',
            required: true,
            helpText: 'Content of Premarket Submissions for Device Software Functions (2023)',
          },
        ],
        issueChecks: [
          {
            id: 'software_no_iec_62304_check',
            condition: { field: 'iec_62304_class', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Software Without IEC 62304 Classification',
            message:
              'All software in medical devices should be classified per IEC 62304. The software safety classification determines the level of documentation and process rigor required.',
            reference: 'IEC 62304:2006+AMD1:2015',
          },
        ],
        defaultNext: 'software_architecture_cybersecurity',
      },

      {
        id: 'software_architecture_cybersecurity',
        section: 'Software Documentation',
        question:
          'Describe the software architecture and cybersecurity measures.',
        guidance:
          'FDA\'s 2023 guidance "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions" requires comprehensive cybersecurity documentation including a Software Bill of Materials (SBOM), threat modeling, and vulnerability management. This applies to all devices with software that connect to networks or exchange data.',
        fields: [
          {
            id: 'architecture_description',
            label: 'Software Architecture Description',
            type: 'textarea',
            required: true,
            helpText: 'Include architecture diagrams description, SOUP/OTS components, and interfaces',
          },
          {
            id: 'sbom_prepared',
            label: 'Software Bill of Materials (SBOM) Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'Required per FDA 2023 Cybersecurity Guidance for connected devices',
          },
          {
            id: 'network_connected',
            label: 'Is the device network-connected or capable of data exchange?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cybersecurity_risk_assessment',
            label: 'Cybersecurity Risk Assessment Completed',
            type: 'yes_no',
            required: true,
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
          },
          {
            id: 'threat_model',
            label: 'Threat Model Completed',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
            helpText: 'Threat model per STRIDE, MITRE ATT&CK, or equivalent methodology',
          },
          {
            id: 'vulnerability_management_plan',
            label: 'Vulnerability Management Plan in Place',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
          },
          {
            id: 'security_controls',
            label: 'Security Controls Implemented',
            type: 'multi_select',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
            options: [
              { value: 'authentication', label: 'Authentication / Access Control' },
              { value: 'encryption', label: 'Data Encryption (at rest and in transit)' },
              { value: 'audit_logging', label: 'Audit Logging' },
              { value: 'software_updates', label: 'Secure Software Update Mechanism' },
              { value: 'data_integrity', label: 'Data Integrity Controls' },
              { value: 'session_management', label: 'Session Management / Timeout' },
              { value: 'secure_boot', label: 'Secure Boot' },
            ],
          },
          {
            id: 'penetration_testing',
            label: 'Penetration Testing Completed',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
          },
        ],
        issueChecks: [
          {
            id: 'samd_no_cybersecurity_check',
            condition: { field: 'cybersecurity_risk_assessment', operator: 'eq', value: false },
            severity: 'critical',
            title: 'SaMD/Connected Device Without Cybersecurity Assessment',
            message:
              'FDA\'s 2023 Cybersecurity Guidance requires a comprehensive cybersecurity risk assessment for all devices with software that connect to networks or exchange data. Submissions without adequate cybersecurity documentation will be refused.',
            reference: 'FDA Guidance: Cybersecurity in Medical Devices (2023)',
          },
          {
            id: 'no_sbom_check',
            condition: { field: 'sbom_prepared', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Software Bill of Materials (SBOM)',
            message:
              'FDA\'s 2023 Cybersecurity Guidance requires a Software Bill of Materials (SBOM) for devices with software. The SBOM must list all software components including commercial, open-source, and off-the-shelf (OTS) software.',
            reference: 'FDA Guidance: Cybersecurity in Medical Devices (2023)',
          },
        ],
        defaultNext: 'software_vv',
      },

      {
        id: 'software_vv',
        section: 'Software Documentation',
        question:
          'Describe the software verification and validation (V&V) activities.',
        guidance:
          'Software verification confirms that each software component meets its specifications. Software validation confirms that the finished device software meets user needs and intended uses. The level of V&V rigor scales with the IEC 62304 software safety classification. FDA expects documentation of unit testing, integration testing, system testing, and acceptance testing.',
        fields: [
          {
            id: 'verification_testing_completed',
            label: 'Software Verification Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'unit_test_coverage',
            label: 'Unit Test Code Coverage (%)',
            type: 'number',
            validation: { min: 0, max: 100 },
            helpText: 'Statement or branch coverage percentage',
          },
          {
            id: 'integration_testing',
            label: 'Integration Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'system_testing',
            label: 'System Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'validation_testing_completed',
            label: 'Software Validation Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'regression_testing_strategy',
            label: 'Regression Testing Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'full', label: 'Full Regression on Every Release' },
              { value: 'risk_based', label: 'Risk-Based Regression' },
              { value: 'automated', label: 'Automated Regression Suite' },
              { value: 'combination', label: 'Combination (Automated + Risk-Based Manual)' },
            ],
          },
          {
            id: 'anomaly_list',
            label: 'Known Software Anomalies / Bugs',
            type: 'textarea',
            helpText: 'List all known unresolved software anomalies with risk assessment for each',
          },
          {
            id: 'traceability_matrix',
            label: 'Requirements Traceability Matrix Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Matrix linking user needs → software requirements → design → verification → validation',
          },
        ],
        branches: [
          {
            when: { field: 'is_sterile', operator: 'eq', value: true },
            goto: 'sterilization',
          },
        ],
        defaultNext: 'labeling',
      },

      /* ── 7. Sterilization & Shelf Life ─────────────────────────────── */

      {
        id: 'sterilization',
        section: 'Sterilization & Shelf Life',
        question:
          'Describe the sterilization method and validation for this device.',
        guidance:
          'Sterile devices require documented sterilization validation per the applicable ISO standard (ISO 11135 for EO, ISO 11137 for radiation, ISO 17665 for steam). The Sterility Assurance Level (SAL) must be established, bioburden testing conducted per ISO 11737-1, and residuals testing completed per applicable standards.',
        fields: [
          {
            id: 'sterilization_method',
            label: 'Sterilization Method',
            type: 'select',
            required: true,
            options: [
              { value: 'eo', label: 'Ethylene Oxide (EO) — ISO 11135' },
              { value: 'gamma', label: 'Gamma Irradiation — ISO 11137' },
              { value: 'e_beam', label: 'Electron Beam (E-Beam) — ISO 11137' },
              { value: 'steam', label: 'Steam (Moist Heat) — ISO 17665' },
              { value: 'dry_heat', label: 'Dry Heat — ISO 20857' },
              { value: 'vhp', label: 'Vaporized Hydrogen Peroxide' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'sal_level',
            label: 'Sterility Assurance Level (SAL)',
            type: 'select',
            required: true,
            options: [
              { value: '10_minus_6', label: '10⁻⁶ (Standard for implants and critical devices)' },
              { value: '10_minus_3', label: '10⁻³ (For certain non-critical applications)' },
            ],
          },
          {
            id: 'sterilization_validation_completed',
            label: 'Sterilization Validation Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'bioburden_testing',
            label: 'Bioburden Testing Completed (ISO 11737-1)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'eo_residuals_testing',
            label: 'EO Residuals Testing Completed (ISO 10993-7)',
            type: 'yes_no',
            visibleWhen: { field: 'sterilization_method', operator: 'eq', value: 'eo' },
            helpText: 'Required for EO-sterilized devices to ensure residual EO and ECH are within limits',
          },
          {
            id: 'sterility_testing',
            label: 'Sterility Testing Completed (ISO 11737-2)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dose_audit_program',
            label: 'Dose Audit / Requalification Program in Place',
            type: 'yes_no',
            visibleWhen: { field: 'sterilization_method', operator: 'in', value: ['gamma', 'e_beam'] },
          },
        ],
        issueChecks: [
          {
            id: 'sterile_no_sal_check',
            condition: { field: 'sterilization_validation_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Sterile Device Without Sterilization Validation',
            message:
              'Sterile devices must have completed sterilization validation per the applicable ISO standard with a documented SAL before 510(k) submission.',
            reference: 'ISO 11135:2014, ISO 11137-1:2006',
          },
        ],
        defaultNext: 'shelf_life_packaging',
      },

      {
        id: 'shelf_life_packaging',
        section: 'Sterilization & Shelf Life',
        question:
          'Describe the shelf life and packaging validation for this device.',
        guidance:
          'Shelf life must be supported by aging data per ASTM F1980 (accelerated aging) and/or real-time aging studies. Packaging validation per ISO 11607 is required for all sterile devices to ensure the sterile barrier system maintains sterility throughout the stated shelf life. Transportation testing per ASTM D4169 validates that the packaged device can withstand distribution conditions.',
        fields: [
          {
            id: 'claimed_shelf_life',
            label: 'Claimed Shelf Life (months)',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'accelerated_aging_completed',
            label: 'Accelerated Aging Completed (ASTM F1980)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'accelerated_aging_temperature',
            label: 'Accelerated Aging Temperature (Celsius)',
            type: 'number',
            visibleWhen: { field: 'accelerated_aging_completed', operator: 'eq', value: true },
            helpText: 'Typically 55C or 60C; Q10 factor must be justified',
          },
          {
            id: 'real_time_aging_status',
            label: 'Real-Time Aging Status',
            type: 'select',
            required: true,
            options: [
              { value: 'not_started', label: 'Not Started' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'completed', label: 'Completed' },
            ],
          },
          {
            id: 'packaging_validation_completed',
            label: 'Packaging Validation Completed (ISO 11607)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'package_integrity_tests',
            label: 'Package Integrity Tests Performed',
            type: 'multi_select',
            options: [
              { value: 'seal_strength', label: 'Seal Strength (ASTM F88)' },
              { value: 'burst_test', label: 'Burst Test (ASTM F1140/F2054)' },
              { value: 'dye_leak', label: 'Dye Leak / Penetration Test' },
              { value: 'visual_inspection', label: 'Visual Seal Inspection' },
              { value: 'microbial_barrier', label: 'Microbial Barrier Testing' },
            ],
          },
          {
            id: 'transportation_testing',
            label: 'Transportation / Distribution Testing Completed (ASTM D4169)',
            type: 'yes_no',
          },
        ],
        issueChecks: [
          {
            id: 'implant_no_aging_check',
            condition: { field: 'accelerated_aging_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Accelerated Aging for Shelf Life Claim',
            message:
              'A shelf life claim without supporting accelerated aging data (ASTM F1980) or real-time aging data is not acceptable. At minimum, accelerated aging must be completed before submission.',
            reference: 'ASTM F1980 Standard Guide for Accelerated Aging',
          },
        ],
        defaultNext: 'labeling',
      },

      /* ── 8. Labeling & Usability ───────────────────────────────────── */

      {
        id: 'labeling',
        section: 'Labeling & Usability',
        question:
          'Describe the device labeling and how it complies with 21 CFR 801.',
        guidance:
          'FDA requires specific labeling content per 21 CFR 801 including adequate directions for use, indications, contraindications, warnings, precautions, and adverse reactions. The Unique Device Identifier (UDI) is required per 21 CFR 830. Instructions for Use (IFU) must be clear, complete, and validated for the intended user population.',
        fields: [
          {
            id: 'labeling_21cfr801_compliant',
            label: '21 CFR 801 Compliant Labeling Prepared',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'labeling_content_includes',
            label: 'Labeling Content Includes',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'indications', label: 'Indications for Use' },
              { value: 'contraindications', label: 'Contraindications' },
              { value: 'warnings', label: 'Warnings' },
              { value: 'precautions', label: 'Precautions' },
              { value: 'adverse_reactions', label: 'Adverse Reactions' },
              { value: 'directions_for_use', label: 'Directions for Use' },
              { value: 'storage_handling', label: 'Storage and Handling' },
              { value: 'cleaning_maintenance', label: 'Cleaning and Maintenance' },
            ],
          },
          {
            id: 'ifu_prepared',
            label: 'Instructions for Use (IFU) Prepared',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'udi_assigned',
            label: 'Unique Device Identifier (UDI) Assigned',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'udi_issuing_agency',
            label: 'UDI Issuing Agency',
            type: 'select',
            visibleWhen: { field: 'udi_assigned', operator: 'eq', value: true },
            options: [
              { value: 'gs1', label: 'GS1' },
              { value: 'hibcc', label: 'HIBCC' },
              { value: 'iccbba', label: 'ICCBBA' },
            ],
          },
          {
            id: 'gudid_submission_planned',
            label: 'GUDID Submission Planned',
            type: 'yes_no',
            helpText: 'Global Unique Device Identification Database submission',
          },
          {
            id: 'symbols_iso_15223',
            label: 'ISO 15223 Symbols Used on Labeling',
            type: 'yes_no',
            helpText: 'Using internationally recognized symbols per ISO 15223-1',
          },
        ],
        issueChecks: [
          {
            id: 'no_udi_check',
            condition: { field: 'udi_assigned', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No UDI Assigned',
            message:
              'A Unique Device Identifier (UDI) is required per 21 CFR 830 for most medical devices. The UDI must appear on the device label and in the GUDID database. Ensure UDI compliance before market launch.',
            reference: '21 CFR 830',
          },
        ],
        defaultNext: 'usability_human_factors',
      },

      {
        id: 'usability_human_factors',
        section: 'Labeling & Usability',
        question:
          'Describe the usability engineering and human factors activities for this device.',
        guidance:
          'FDA\'s Human Factors (HFE/UE) guidance requires that device manufacturers apply human factors engineering to demonstrate that the device can be used safely and effectively by the intended users. IEC 62366-1 provides the framework for usability engineering. Summative (validation) testing is typically required for devices with use-related risks. Critical tasks must be identified through use-related risk analysis.',
        fields: [
          {
            id: 'iec_62366_1_applied',
            label: 'IEC 62366-1 Usability Engineering Applied',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'use_related_risk_analysis',
            label: 'Use-Related Risk Analysis Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'critical_tasks_identified',
            label: 'Critical Tasks Identified',
            type: 'yes_no',
            required: true,
            helpText: 'Tasks where use error could cause serious harm to the patient or user',
          },
          {
            id: 'number_of_critical_tasks',
            label: 'Number of Critical Tasks',
            type: 'number',
            visibleWhen: { field: 'critical_tasks_identified', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'formative_studies_completed',
            label: 'Formative Usability Studies Completed',
            type: 'yes_no',
            helpText: 'Iterative design evaluation studies (e.g., cognitive walkthroughs, simulated use)',
          },
          {
            id: 'number_formative_studies',
            label: 'Number of Formative Studies',
            type: 'number',
            visibleWhen: { field: 'formative_studies_completed', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'summative_testing_completed',
            label: 'Summative (HFE Validation) Testing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Final validation testing with representative users in simulated use environment',
          },
          {
            id: 'summative_participants',
            label: 'Number of Summative Test Participants',
            type: 'number',
            visibleWhen: { field: 'summative_testing_completed', operator: 'eq', value: true },
            validation: { min: 1 },
            helpText: 'FDA typically expects 15+ participants per user group',
          },
          {
            id: 'user_groups',
            label: 'Intended User Groups',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'healthcare_professional', label: 'Healthcare Professional' },
              { value: 'patient', label: 'Patient / Lay User' },
              { value: 'caregiver', label: 'Caregiver' },
              { value: 'technician', label: 'Technician / Biomedical Engineer' },
            ],
          },
          {
            id: 'use_environments',
            label: 'Use Environments',
            type: 'multi_select',
            options: [
              { value: 'hospital', label: 'Hospital / Clinical Setting' },
              { value: 'home', label: 'Home Use' },
              { value: 'ambulatory', label: 'Ambulatory / Mobile' },
              { value: 'emergency', label: 'Emergency / First Responder' },
              { value: 'operating_room', label: 'Operating Room' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_usability_patient_use_check',
            condition: { field: 'summative_testing_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Summative Usability Testing',
            message:
              'For devices with use-related risks (especially patient-use/OTC devices), FDA expects summative human factors validation testing. The absence of HFE validation data may result in an Additional Information request or Refuse to Accept.',
            reference: 'FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices (2016)',
          },
        ],
        defaultNext: 'risk_management',
      },

      /* ── 9. Risk Management & Post-Market ──────────────────────────── */

      {
        id: 'risk_management',
        section: 'Risk Management & Post-Market',
        question:
          'Describe the risk management process and outputs for this device.',
        guidance:
          'ISO 14971 is the recognized standard for risk management of medical devices. The risk management process must cover hazard identification, risk estimation, risk evaluation, risk control, and evaluation of overall residual risk. FDA expects a summary of the risk management file in the 510(k) submission. Common risk analysis methods include FMEA (Failure Mode and Effects Analysis), FTA (Fault Tree Analysis), and HAZOP (Hazard and Operability Study).',
        fields: [
          {
            id: 'iso_14971_applied',
            label: 'ISO 14971 Risk Management Process Applied',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'risk_analysis_method',
            label: 'Risk Analysis Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'fmea', label: 'FMEA (Failure Mode and Effects Analysis)' },
              { value: 'dfmea', label: 'dFMEA (Design FMEA)' },
              { value: 'pfmea', label: 'pFMEA (Process FMEA)' },
              { value: 'fta', label: 'FTA (Fault Tree Analysis)' },
              { value: 'hazop', label: 'HAZOP (Hazard and Operability Study)' },
              { value: 'pha', label: 'PHA (Preliminary Hazard Analysis)' },
            ],
          },
          {
            id: 'risk_acceptability_criteria',
            label: 'Risk Acceptability Criteria Defined',
            type: 'yes_no',
            required: true,
            helpText: 'Risk acceptability matrix with severity and probability levels',
          },
          {
            id: 'number_identified_hazards',
            label: 'Number of Identified Hazards',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'unacceptable_risks_remaining',
            label: 'Any Unacceptable Residual Risks Remaining',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'risk_benefit_analysis_performed',
            label: 'Risk-Benefit Analysis Performed',
            type: 'yes_no',
            required: true,
            helpText: 'Required when residual risks exist that could not be further reduced',
          },
          {
            id: 'residual_risk_disclosure',
            label: 'Residual Risks Disclosed in Labeling',
            type: 'yes_no',
            helpText: 'Residual risks must be disclosed to users through labeling per ISO 14971',
          },
        ],
        issueChecks: [
          {
            id: 'no_iso_14971_check',
            condition: { field: 'iso_14971_applied', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No ISO 14971 Risk Management',
            message:
              'ISO 14971 risk management is a recognized consensus standard expected by FDA for all medical device submissions. The absence of a risk management process is a significant gap that will likely result in submission deficiency.',
            reference: 'ISO 14971:2019',
          },
        ],
        defaultNext: 'post_market_surveillance',
      },

      {
        id: 'post_market_surveillance',
        section: 'Risk Management & Post-Market',
        question:
          'Describe the post-market surveillance and reporting plans for this device.',
        guidance:
          'Post-market surveillance is a regulatory requirement for all marketed medical devices. FDA requires Medical Device Reporting (MDR) per 21 CFR 803 for deaths, serious injuries, and malfunctions. A post-market surveillance plan should include complaint handling, MDR procedures, corrections and removals per 21 CFR 806, and trending analysis. For certain devices, FDA may require Section 522 post-market surveillance studies.',
        fields: [
          {
            id: 'complaint_handling_process',
            label: 'Complaint Handling Process Established',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'mdr_procedure',
            label: 'MDR (Medical Device Reporting) Procedure in Place',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 803 — reporting of deaths, serious injuries, and malfunctions',
          },
          {
            id: 'mdr_reporting_timeframes',
            label: 'MDR Reporting Timeframes Documented',
            type: 'yes_no',
            helpText: '5-day reports, 30-day reports, and annual certification',
          },
          {
            id: 'corrections_removals_plan',
            label: 'Corrections and Removals Plan Established',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 806 — procedures for recalls and field corrections',
          },
          {
            id: 'post_market_surveillance_plan',
            label: 'Post-Market Surveillance Plan Developed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'section_522_applicable',
            label: 'Section 522 Post-Market Surveillance Applicable',
            type: 'yes_no',
            helpText: 'FDA may order post-market surveillance studies for certain Class II/III devices',
          },
          {
            id: 'trending_analysis_plan',
            label: 'Complaint/MDR Trending Analysis Plan',
            type: 'yes_no',
            helpText: 'Systematic analysis of complaint and MDR trends to identify emerging safety signals',
          },
          {
            id: 'field_service_plan',
            label: 'Field Service and Maintenance Plan',
            type: 'yes_no',
            helpText: 'For devices requiring installation, calibration, or periodic maintenance',
          },
        ],
        branches: [
          {
            when: { field: 'is_implant', operator: 'eq', value: true },
            goto: 'implant_specific',
          },
        ],
        defaultNext: null,
      },

      {
        id: 'implant_specific',
        section: 'Risk Management & Post-Market',
        question:
          'For this implantable device, provide additional information required by FDA.',
        guidance:
          'Implantable devices face heightened scrutiny from FDA and require additional documentation. This includes fatigue testing, corrosion testing (for metallic implants), MRI safety assessment, explant analysis protocols, and patient implant cards. Long-term biocompatibility and mechanical performance must be demonstrated for the expected implant duration.',
        fields: [
          {
            id: 'expected_implant_duration',
            label: 'Expected Implant Duration',
            type: 'select',
            required: true,
            options: [
              { value: 'temporary', label: 'Temporary (< 30 days)' },
              { value: 'short_term', label: 'Short-Term (30 days - 1 year)' },
              { value: 'long_term', label: 'Long-Term (1 - 10 years)' },
              { value: 'permanent', label: 'Permanent (> 10 years / lifetime)' },
            ],
          },
          {
            id: 'fatigue_testing',
            label: 'Fatigue / Durability Testing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Mechanical fatigue testing simulating expected in-vivo loading conditions',
          },
          {
            id: 'fatigue_cycles',
            label: 'Number of Fatigue Cycles Tested',
            type: 'number',
            visibleWhen: { field: 'fatigue_testing', operator: 'eq', value: true },
            helpText: 'e.g. 10 million cycles for orthopedic implants',
          },
          {
            id: 'corrosion_testing',
            label: 'Corrosion Testing Completed',
            type: 'yes_no',
            helpText: 'Per ASTM F2129 (pitting/crevice corrosion) for metallic implants',
          },
          {
            id: 'wear_testing',
            label: 'Wear / Debris Testing Completed',
            type: 'yes_no',
            helpText: 'For articulating implants — wear particle characterization',
          },
          {
            id: 'patient_implant_card',
            label: 'Patient Implant Card Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'Required for implantable devices to provide to patients',
          },
          {
            id: 'explant_retrieval_program',
            label: 'Explant / Retrieval Analysis Program',
            type: 'yes_no',
            helpText: 'Program to systematically analyze explanted devices',
          },
          {
            id: 'mri_safety_testing',
            label: 'MRI Safety Testing Completed (ASTM F2052, F2213, F2182)',
            type: 'yes_no',
            required: true,
            helpText: 'Magnetically induced displacement, torque, and RF heating tests',
          },
        ],
        issueChecks: [
          {
            id: 'implant_no_fatigue_check',
            condition: { field: 'fatigue_testing', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Implant Without Fatigue Testing',
            message:
              'Implantable devices typically require fatigue/durability testing to demonstrate mechanical performance over the expected implant duration. FDA will likely request this data.',
          },
          {
            id: 'implant_no_mri_check',
            condition: { field: 'mri_safety_testing', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Implant Without MRI Safety Testing',
            message:
              'MRI safety testing and labeling is expected for most implantable devices per ASTM F2503. Patients and clinicians need to know MRI compatibility status.',
            reference: 'ASTM F2503',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
