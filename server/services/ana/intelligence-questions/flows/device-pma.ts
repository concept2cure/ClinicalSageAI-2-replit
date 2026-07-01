/**
 * PMA (Premarket Approval) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides medtech sponsors through a comprehensive PMA submission
 * questionnaire per 21 CFR 814, covering device overview, predicate &
 * classification, design & manufacturing, preclinical testing
 * (biocompatibility, bench performance, animal studies), clinical
 * evidence, software & cybersecurity, labeling & human factors, and
 * post-market surveillance.
 *
 * 22 nodes · 90+ fields · 8 sections · issue checks on key nodes
 *
 * @module server/services/ana/intelligence-questions/flows/device-pma
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createDevicePmaFlow(): FlowDefinition {
  return {
    id: 'device-pma-v1',
    category: 'device_pma',
    name: 'PMA (Premarket Approval)',
    description:
      'Comprehensive questionnaire for Premarket Approval (PMA) submissions per 21 CFR 814, covering device overview, classification, design controls, manufacturing, preclinical testing (biocompatibility, bench performance, animal studies), clinical evidence, software & cybersecurity documentation, labeling, human factors engineering, and post-market surveillance planning.',
    clientTypes: ['medtech'],
    entryNode: 'device_basics',
    estimatedMinutes: 90,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'device_overview',
        label: 'Device Overview',
        nodeIds: ['device_basics', 'intended_use_indications', 'device_materials'],
      },
      {
        id: 'predicate_classification',
        label: 'Predicate & Classification',
        nodeIds: ['classification_info', 'combination_product'],
      },
      {
        id: 'design_manufacturing',
        label: 'Design & Manufacturing',
        nodeIds: ['design_controls', 'manufacturing_process', 'quality_system'],
      },
      {
        id: 'preclinical_testing',
        label: 'Preclinical Testing',
        nodeIds: ['biocompatibility_testing', 'bench_performance', 'animal_studies'],
      },
      {
        id: 'clinical_evidence',
        label: 'Clinical Evidence',
        nodeIds: ['clinical_study_overview', 'clinical_results', 'clinical_adverse_events'],
      },
      {
        id: 'software_cybersecurity',
        label: 'Software & Cybersecurity',
        nodeIds: ['software_documentation', 'cybersecurity_assessment'],
      },
      {
        id: 'labeling_human_factors',
        label: 'Labeling & Human Factors',
        nodeIds: ['labeling_review', 'human_factors_engineering'],
      },
      {
        id: 'post_market',
        label: 'Post-Market Surveillance',
        nodeIds: ['post_market_plan', 'risk_management_summary', 'manufacturing_post_approval'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── 1. Device Overview ──────────────────────────────────────── */

      {
        id: 'device_basics',
        section: 'Device Overview',
        question:
          'Let\'s begin with the basic device information for the PMA submission. What is the device and who is the applicant?',
        guidance:
          'Accurate device identification is the foundation of the PMA application per 21 CFR 814.20(b)(1). The applicant must be the legal manufacturer or authorized representative. The establishment registration number links to your FDA facility registration in FURLS. Provide the trade name, common/generic name, and a comprehensive device description covering principles of operation, components, and accessories.',
        fields: [
          {
            id: 'device_trade_name',
            label: 'Device Trade Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. NeuroStim Adaptive DBS System',
          },
          {
            id: 'device_common_name',
            label: 'Device Common/Generic Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. Implantable Deep Brain Stimulation System',
          },
          {
            id: 'applicant_name',
            label: 'Applicant Name',
            type: 'text',
            required: true,
            helpText: 'Legal manufacturer or authorized representative submitting the PMA',
          },
          {
            id: 'applicant_address',
            label: 'Applicant Address',
            type: 'textarea',
            required: true,
          },
          {
            id: 'establishment_registration_number',
            label: 'Establishment Registration Number',
            type: 'text',
            helpText: 'FDA facility registration number from FURLS (21 CFR 807)',
          },
          {
            id: 'device_description',
            label: 'Comprehensive Device Description',
            type: 'textarea',
            required: true,
            helpText: 'Describe the device, all components, accessories, principles of operation, and energy source per 21 CFR 814.20(b)(3)',
            validation: { minLength: 100 },
          },
          {
            id: 'is_combination_product',
            label: 'Is this a combination product (device + drug/biologic)?',
            type: 'yes_no',
            required: true,
            helpText: 'Combination products are regulated under 21 CFR 3.2 and may require additional submissions',
          },
          {
            id: 'contains_software',
            label: 'Does the device contain or consist of software?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'is_implantable',
            label: 'Is the device an implant?',
            type: 'yes_no',
            required: true,
            helpText: 'Implantable devices have additional biocompatibility, sterilization, and long-term safety requirements',
          },
          {
            id: 'is_sterile',
            label: 'Is the device provided sterile?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'has_patient_contact',
            label: 'Does the device contact the patient?',
            type: 'yes_no',
            required: true,
          },
        ],
        branches: [
          {
            when: { field: 'is_combination_product', operator: 'eq', value: true },
            goto: 'combination_product',
          },
        ],
        defaultNext: 'intended_use_indications',
      },

      {
        id: 'intended_use_indications',
        section: 'Device Overview',
        question:
          'Define the intended use and indications for use for this device.',
        guidance:
          'The indications for use statement is one of the most critical elements of the PMA application per 21 CFR 814.20(b)(3)(i). It defines the specific disease or condition the device is intended to diagnose, treat, prevent, cure, or mitigate, the target patient population, and the intended clinical setting. The indications for use statement will appear on the device labeling and determines the scope of the clinical studies required to support the PMA. FDA reviews indications for use very carefully — overly broad claims require more extensive clinical evidence. Include any contraindications that limit the patient population.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'intended_use',
            label: 'Intended Use Statement',
            type: 'textarea',
            required: true,
            helpText: 'General statement of the device\'s purpose per 21 CFR 814.20(b)(3)(i)',
            validation: { minLength: 30 },
          },
          {
            id: 'indications_for_use',
            label: 'Indications for Use',
            type: 'textarea',
            required: true,
            helpText: 'Specific conditions, patient populations, and clinical scenarios for which the device is indicated',
            validation: { minLength: 50 },
          },
          {
            id: 'target_patient_population',
            label: 'Target Patient Population',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. Adults aged 18 and older with medication-refractory essential tremor',
            helpText: 'Define the patient population including age range, disease state, and any inclusion/exclusion criteria',
          },
          {
            id: 'contraindications',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
            helpText: 'Specific conditions or patient populations for which the device should NOT be used',
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
          {
            id: 'intended_use_environments',
            label: 'Intended Use Environments',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'hospital', label: 'Hospital / Clinical Setting' },
              { value: 'operating_room', label: 'Operating Room / Surgical Suite' },
              { value: 'outpatient', label: 'Outpatient Clinic' },
              { value: 'home', label: 'Home Use' },
              { value: 'emergency', label: 'Emergency / Critical Care' },
              { value: 'ambulatory', label: 'Ambulatory / Mobile' },
            ],
          },
        ],
        defaultNext: 'device_materials',
      },

      {
        id: 'device_materials',
        section: 'Device Overview',
        question:
          'Describe the materials used in the device construction.',
        guidance:
          'A thorough description of device materials is required per 21 CFR 814.20(b)(3)(ii). For patient-contacting and implantable devices, material selection directly impacts biocompatibility testing requirements per ISO 10993-1. Include all materials that contact the patient or are part of the primary device structure. Specify material grades, suppliers, and any history of clinical use.',
        fields: [
          {
            id: 'patient_contacting_materials',
            label: 'Patient-Contacting Materials',
            type: 'textarea',
            required: true,
            helpText: 'List all materials that directly or indirectly contact the patient, including grades and specifications',
            validation: { minLength: 20 },
          },
          {
            id: 'structural_materials',
            label: 'Non-Patient-Contacting Structural Materials',
            type: 'textarea',
            helpText: 'Materials used in device housing, enclosures, or structural components that do not contact the patient',
          },
          {
            id: 'material_biocompatibility_history',
            label: 'Do the materials have a history of clinical use in similar devices?',
            type: 'yes_no',
            required: true,
            helpText: 'Materials with established biocompatibility history (e.g. titanium, PEEK, silicone) may require less testing',
          },
          {
            id: 'implant_materials_detail',
            label: 'Implant Material Specifications',
            type: 'textarea',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            helpText: 'For implantable components, provide ASTM/ISO material standards, lot traceability, and material certificates',
            validation: { minLength: 30 },
          },
          {
            id: 'coatings_surface_treatments',
            label: 'Coatings or Surface Treatments',
            type: 'textarea',
            helpText: 'Describe any coatings, surface modifications, or drug-eluting surfaces applied to the device',
          },
          {
            id: 'material_change_from_predicate',
            label: 'Are any materials different from previously approved devices in the same class?',
            type: 'yes_no',
            helpText: 'Novel materials may trigger additional biocompatibility and performance testing requirements',
          },
        ],
        defaultNext: 'classification_info',
      },

      /* ── 2. Predicate & Classification ───────────────────────────── */

      {
        id: 'classification_info',
        section: 'Predicate & Classification',
        question:
          'What is the FDA classification and regulatory history for this device type?',
        guidance:
          'PMA is required for Class III devices per 21 CFR 814. The product code and regulation number determine the applicable FDA requirements and the review division. Provide the classification panel and identify any applicable guidance documents. If an Advisory Panel meeting is anticipated, note the relevant panel. Reference any prior PMA approvals for the same device type, as these establish the predicate expectations for clinical evidence and testing.',
        fields: [
          {
            id: 'product_code',
            label: 'Product Code',
            type: 'text',
            required: true,
            helpText: 'FDA 3-letter product code (e.g. LWP, NIQ)',
          },
          {
            id: 'regulation_number',
            label: 'Regulation Number',
            type: 'text',
            required: true,
            placeholder: 'e.g. 21 CFR 870.xxxx',
          },
          {
            id: 'device_class',
            label: 'Device Class',
            type: 'select',
            required: true,
            options: [
              { value: 'class_iii', label: 'Class III', description: 'PMA required' },
              { value: 'class_ii_pma', label: 'Class II (transitional — PMA required)', description: 'Reclassified device requiring PMA' },
            ],
          },
          {
            id: 'review_panel',
            label: 'FDA Review Panel',
            type: 'text',
            required: true,
            helpText: 'FDA advisory committee / review panel (e.g. Cardiovascular, Neurological, Orthopedic)',
          },
          {
            id: 'prior_pma_approvals',
            label: 'Prior PMA Approvals for Same Device Type',
            type: 'textarea',
            helpText: 'List PMA numbers and applicant names of previously approved devices in the same product code (e.g. P123456)',
          },
          {
            id: 'applicable_guidance_documents',
            label: 'Applicable FDA Guidance Documents',
            type: 'textarea',
            helpText: 'List any FDA guidance documents applicable to this device type',
          },
          {
            id: 'advisory_panel_anticipated',
            label: 'Advisory Panel Meeting Anticipated?',
            type: 'yes_no',
            helpText: 'FDA may convene an advisory panel for novel or high-risk Class III devices per 21 CFR 814.44(e)',
          },
          {
            id: 'pre_submission_meeting',
            label: 'Pre-Submission (Q-Sub) Meeting Status',
            type: 'select',
            options: [
              { value: 'not_planned', label: 'Not Planned' },
              { value: 'planned', label: 'Planned / Requested' },
              { value: 'completed', label: 'Completed' },
            ],
            helpText: 'Pre-submission meetings are strongly recommended for PMA applications',
          },
        ],
        defaultNext: 'design_controls',
      },

      {
        id: 'combination_product',
        section: 'Predicate & Classification',
        question:
          'Provide details about the combination product constituents.',
        guidance:
          'Combination products (device + drug or device + biologic) are regulated under 21 CFR Part 3 and require identification of the primary mode of action (PMOA) to determine which FDA center has primary jurisdiction. Under the Combination Products Policy (21 CFR 3.4), the lead center reviews the combination product with input from the collaborating center. For device-led combination products submitted as a PMA, the drug/biologic constituent may require additional nonclinical and clinical data. Intercenter agreements and pre-submission meetings with the Office of Combination Products (OCP) are strongly recommended.',
        fields: [
          {
            id: 'combination_type',
            label: 'Combination Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'device_drug', label: 'Device + Drug' },
              { value: 'device_biologic', label: 'Device + Biologic' },
              { value: 'device_drug_biologic', label: 'Device + Drug + Biologic' },
            ],
          },
          {
            id: 'primary_mode_of_action',
            label: 'Primary Mode of Action (PMOA)',
            type: 'select',
            required: true,
            options: [
              { value: 'device', label: 'Device' },
              { value: 'drug', label: 'Drug' },
              { value: 'biologic', label: 'Biologic' },
            ],
            helpText: 'Determines the lead FDA center (CDRH, CDER, or CBER) per 21 CFR 3.4',
          },
          {
            id: 'drug_biologic_description',
            label: 'Drug/Biologic Constituent Description',
            type: 'textarea',
            required: true,
            helpText: 'Describe the drug or biologic component, its function, dosage form, and mechanism of action',
            validation: { minLength: 30 },
          },
          {
            id: 'ocp_designation',
            label: 'OCP Request for Designation (RFD) Filed?',
            type: 'yes_no',
            helpText: 'FDA Office of Combination Products designation request per 21 CFR 3.7',
          },
          {
            id: 'drug_biologic_regulatory_status',
            label: 'Drug/Biologic Regulatory Status',
            type: 'select',
            options: [
              { value: 'approved', label: 'Already FDA-Approved' },
              { value: 'under_review', label: 'Under Regulatory Review' },
              { value: 'not_approved', label: 'Not Previously Approved' },
            ],
          },
          {
            id: 'combination_nonclinical_data',
            label: 'Nonclinical Data for Drug/Biologic Constituent',
            type: 'textarea',
            helpText: 'Summarize nonclinical studies supporting the safety and effectiveness of the drug/biologic constituent',
          },
        ],
        defaultNext: 'classification_info',
      },

      /* ── 3. Design & Manufacturing ───────────────────────────────── */

      {
        id: 'design_controls',
        section: 'Design & Manufacturing',
        question:
          'Describe the design controls applied during device development.',
        guidance:
          'Design controls per 21 CFR 820.30 are mandatory for Class III devices and are a critical component of the PMA review. FDA will evaluate whether the design control process produced adequate evidence that the device meets its design inputs. The design history file (DHF) should document the complete design and development lifecycle including design planning, input, output, review, verification, validation, and transfer. ISO 13485:2016 Section 7.3 aligns with these requirements internationally.',
        fields: [
          {
            id: 'design_control_procedures',
            label: 'Design Control Procedures Established (21 CFR 820.30)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'design_inputs_documented',
            label: 'Design Inputs Documented and Approved',
            type: 'yes_no',
            required: true,
            helpText: 'User needs, intended use, performance requirements, safety requirements, and applicable standards',
          },
          {
            id: 'design_outputs_documented',
            label: 'Design Outputs Documented',
            type: 'yes_no',
            required: true,
            helpText: 'Device specifications, drawings, software requirements, manufacturing procedures per 21 CFR 820.30(d)',
          },
          {
            id: 'design_verification_completed',
            label: 'Design Verification Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Confirmation that design outputs meet design inputs through testing, analysis, or inspection per 21 CFR 820.30(f)',
          },
          {
            id: 'design_validation_completed',
            label: 'Design Validation Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Confirmation that the device meets user needs and intended uses under actual or simulated use conditions per 21 CFR 820.30(g)',
          },
          {
            id: 'design_transfer_completed',
            label: 'Design Transfer to Manufacturing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Verification that the design was correctly translated into production specifications per 21 CFR 820.30(h)',
          },
          {
            id: 'design_changes_documented',
            label: 'Design Changes Documented and Controlled',
            type: 'yes_no',
            required: true,
            helpText: 'All design changes evaluated, approved, and documented per 21 CFR 820.30(i)',
          },
          {
            id: 'design_history_file',
            label: 'Design History File (DHF) Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Complete DHF compiled per 21 CFR 820.30(j) documenting the full design and development lifecycle',
          },
        ],
        issueChecks: [
          {
            id: 'incomplete_design_controls_check',
            condition: { field: 'design_control_procedures', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Missing Design Controls',
            message:
              'Design controls per 21 CFR 820.30 are mandatory for Class III devices. A PMA submission without documented design controls will be found deficient during FDA review and may result in Refuse to File.',
            reference: '21 CFR 820.30',
          },
          {
            id: 'no_design_validation_check',
            condition: { field: 'design_validation_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Design Validation Not Completed',
            message:
              'Design validation under actual or simulated use conditions is required per 21 CFR 820.30(g). For PMA devices, design validation typically includes clinical studies. Submitting without completed design validation is a significant deficiency.',
            reference: '21 CFR 820.30(g)',
          },
        ],
        defaultNext: 'manufacturing_process',
      },

      {
        id: 'manufacturing_process',
        section: 'Design & Manufacturing',
        question:
          'Describe the manufacturing process and any special process validations.',
        guidance:
          'Per 21 CFR 814.20(b)(4), the PMA must include a complete description of the methods, facilities, and controls used for the manufacture, processing, packing, storage, and installation of the device. Manufacturing must comply with the Quality System Regulation (QSR) per 21 CFR 820. Special processes such as sterilization, welding, molding, and coating that cannot be fully verified by subsequent inspection and test must be validated per 21 CFR 820.75. FDA may conduct a pre-approval inspection of the manufacturing facility.',
        fields: [
          {
            id: 'manufacturing_description',
            label: 'Manufacturing Process Description',
            type: 'textarea',
            required: true,
            helpText: 'Describe the complete manufacturing process including key steps, equipment, and controls per 21 CFR 814.20(b)(4)',
            validation: { minLength: 50 },
          },
          {
            id: 'manufacturing_site',
            label: 'Manufacturing Site(s)',
            type: 'textarea',
            required: true,
            helpText: 'Names, addresses, and functions of all manufacturing sites (including contract manufacturers)',
          },
          {
            id: 'special_processes',
            label: 'Special Processes Requiring Validation',
            type: 'multi_select',
            options: [
              { value: 'sterilization', label: 'Sterilization' },
              { value: 'welding', label: 'Welding / Joining' },
              { value: 'molding', label: 'Injection Molding' },
              { value: 'coating', label: 'Coating / Surface Treatment' },
              { value: 'sealing', label: 'Sealing (heat seal, ultrasonic)' },
              { value: 'cleaning', label: 'Cleaning / Passivation' },
              { value: 'forming', label: 'Forming / Machining' },
              { value: 'software_manufacturing', label: 'Software Build / Configuration' },
            ],
          },
          {
            id: 'process_validations_completed',
            label: 'All Special Process Validations Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.75, processes whose results cannot be fully verified by inspection must be validated',
          },
          {
            id: 'sterilization_validated',
            label: 'Sterilization Process Validated',
            type: 'yes_no',
            visibleWhen: { field: 'is_sterile', operator: 'eq', value: true },
            helpText: 'Sterilization must be validated per the applicable ISO standard (ISO 11135, ISO 11137, ISO 17665)',
          },
          {
            id: 'sterilization_method',
            label: 'Sterilization Method',
            type: 'select',
            visibleWhen: { field: 'is_sterile', operator: 'eq', value: true },
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
            id: 'contract_manufacturers',
            label: 'Contract Manufacturers Used',
            type: 'yes_no',
            helpText: 'Contract manufacturers must be qualified and subject to supplier controls per 21 CFR 820.50',
          },
        ],
        issueChecks: [
          {
            id: 'sterilization_not_validated_check',
            condition: { field: 'sterilization_validated', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Sterilization Not Validated',
            message:
              'Sterile devices must have completed sterilization validation per the applicable ISO standard (ISO 11135, ISO 11137, ISO 17665) before PMA submission. Unvalidated sterilization is a critical deficiency per 21 CFR 820.75.',
            reference: '21 CFR 820.75; ISO 11135; ISO 11137',
          },
          {
            id: 'process_validation_incomplete_check',
            condition: { field: 'process_validations_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Incomplete Process Validations',
            message:
              'All special processes must be validated per 21 CFR 820.75 before PMA submission. Incomplete process validations may result in findings during FDA pre-approval inspection.',
            reference: '21 CFR 820.75',
          },
        ],
        defaultNext: 'quality_system',
      },

      {
        id: 'quality_system',
        section: 'Design & Manufacturing',
        question:
          'Describe the Quality Management System (QMS) in place for this device.',
        guidance:
          'The PMA applicant must demonstrate compliance with the Quality System Regulation (21 CFR 820) and ideally ISO 13485:2016. FDA will typically conduct a pre-approval inspection to verify QMS compliance before granting PMA approval. The QMS should cover document controls, CAPA, supplier management, production and process controls, inspection and testing, and management review. Having an ISO 13485 certification from a recognized body provides additional confidence but does not replace 21 CFR 820 compliance.',
        fields: [
          {
            id: 'qsr_compliance',
            label: '21 CFR 820 (QSR/cGMP) Compliance Established',
            type: 'yes_no',
            required: true,
            helpText: 'Quality System Regulation compliance is mandatory for PMA applicants',
          },
          {
            id: 'iso_13485_certified',
            label: 'ISO 13485 Certification',
            type: 'select',
            required: true,
            options: [
              { value: 'certified', label: 'Certified by Accredited Body' },
              { value: 'in_progress', label: 'Certification In Progress' },
              { value: 'compliant_not_certified', label: 'Compliant but Not Certified' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'capa_system',
            label: 'CAPA System Established (21 CFR 820.90)',
            type: 'yes_no',
            required: true,
            helpText: 'Corrective and Preventive Action system for identifying and resolving quality issues',
          },
          {
            id: 'document_control',
            label: 'Document Control System in Place (21 CFR 820.40)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'supplier_controls',
            label: 'Supplier Controls Established (21 CFR 820.50)',
            type: 'yes_no',
            required: true,
            helpText: 'Procedures for evaluating and monitoring suppliers, contractors, and consultants',
          },
          {
            id: 'management_review',
            label: 'Management Review Process in Place',
            type: 'yes_no',
            required: true,
            helpText: 'Regular management review of QMS effectiveness per ISO 13485:2016 Section 5.6',
          },
          {
            id: 'pre_approval_inspection_readiness',
            label: 'Pre-Approval Inspection Readiness',
            type: 'select',
            required: true,
            options: [
              { value: 'ready', label: 'Ready for FDA Inspection' },
              { value: 'preparing', label: 'Preparing for Inspection' },
              { value: 'not_ready', label: 'Not Yet Ready' },
            ],
            helpText: 'FDA conducts a pre-approval inspection for most PMA applications per 21 CFR 814.20(b)(4)',
          },
        ],
        issueChecks: [
          {
            id: 'no_qsr_compliance_check',
            condition: { field: 'qsr_compliance', operator: 'eq', value: false },
            severity: 'critical',
            title: 'QSR Non-Compliance',
            message:
              'Compliance with the Quality System Regulation (21 CFR 820) is mandatory for PMA applicants. FDA will not approve a PMA if the pre-approval inspection reveals significant QSR non-compliance.',
            reference: '21 CFR 820; 21 CFR 814.20(b)(4)',
          },
        ],
        defaultNext: 'biocompatibility_testing',
      },

      /* ── 4. Preclinical Testing ──────────────────────────────────── */

      {
        id: 'biocompatibility_testing',
        section: 'Preclinical Testing',
        question:
          'Describe the biocompatibility evaluation performed for this device.',
        guidance:
          'Biocompatibility evaluation per ISO 10993-1 is required for all PMA devices that contact the patient per 21 CFR 814.20(b)(3)(v). The evaluation must consider the nature and duration of patient contact, the materials used, and applicable ISO 10993 test standards. FDA\'s 2020 guidance on ISO 10993-1 emphasizes a risk-based approach starting with chemical characterization (ISO 10993-18) before biological testing. For implantable devices, chronic toxicity, implantation, and degradation studies are typically required. The biological evaluation plan and report should follow the structure in ISO 10993-1 Annex A.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'iso_10993_evaluation',
            label: 'ISO 10993-1 Biological Evaluation Completed',
            type: 'yes_no',
            required: true,
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
          },
          {
            id: 'contact_duration',
            label: 'Contact Duration',
            type: 'select',
            required: true,
            options: [
              { value: 'limited', label: 'Limited (< 24 hours)' },
              { value: 'prolonged', label: 'Prolonged (24 hours — 30 days)' },
              { value: 'permanent', label: 'Permanent (> 30 days)' },
            ],
          },
          {
            id: 'biocompat_tests_conducted',
            label: 'Biocompatibility Tests Conducted',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'cytotoxicity', label: 'Cytotoxicity (ISO 10993-5)' },
              { value: 'sensitization', label: 'Sensitization (ISO 10993-10)' },
              { value: 'irritation', label: 'Irritation (ISO 10993-10)' },
              { value: 'systemic_toxicity', label: 'Systemic Toxicity — Acute (ISO 10993-11)' },
              { value: 'subchronic_toxicity', label: 'Systemic Toxicity — Subchronic (ISO 10993-11)' },
              { value: 'chronic_toxicity', label: 'Systemic Toxicity — Chronic (ISO 10993-11)' },
              { value: 'genotoxicity', label: 'Genotoxicity (ISO 10993-3)' },
              { value: 'implantation', label: 'Implantation (ISO 10993-6)' },
              { value: 'hemocompatibility', label: 'Hemocompatibility (ISO 10993-4)' },
              { value: 'chemical_characterization', label: 'Chemical Characterization (ISO 10993-18)' },
              { value: 'degradation', label: 'Degradation (ISO 10993-13/14/15)' },
              { value: 'carcinogenicity', label: 'Carcinogenicity (ISO 10993-3)' },
              { value: 'reproductive_toxicity', label: 'Reproductive/Developmental Toxicity (ISO 10993-3)' },
            ],
          },
          {
            id: 'chemical_characterization_completed',
            label: 'Chemical Characterization Completed (ISO 10993-18)',
            type: 'yes_no',
            required: true,
            helpText: 'FDA recommends chemical characterization as the first step before biological testing per 2020 guidance',
          },
          {
            id: 'implant_specific_testing',
            label: 'Implant-Specific Long-Term Biocompatibility Testing',
            type: 'textarea',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            helpText: 'Describe chronic toxicity, implantation, and degradation studies for implantable components per ISO 10993',
          },
          {
            id: 'biocompatibility_testing_lab',
            label: 'Testing Laboratory (GLP Compliant)',
            type: 'text',
            helpText: 'Biocompatibility testing must be conducted under GLP conditions per 21 CFR 58',
          },
        ],
        issueChecks: [
          {
            id: 'inadequate_biocompatibility_check',
            condition: { field: 'iso_10993_evaluation', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Inadequate Biocompatibility Evaluation',
            message:
              'ISO 10993-1 biological evaluation is required for all PMA devices with patient contact. A device with patient contact that lacks a completed biocompatibility evaluation per ISO 10993-1 will be found deficient during FDA review. This is a mandatory component of the PMA application per 21 CFR 814.20(b)(3)(v).',
            reference: 'ISO 10993-1:2018; 21 CFR 814.20(b)(3)(v)',
          },
          {
            id: 'permanent_implant_no_chronic_testing_check',
            condition: { field: 'contact_duration', operator: 'eq', value: 'permanent' },
            severity: 'warning',
            title: 'Permanent Implant Requires Comprehensive Biocompatibility',
            message:
              'Permanent implants (>30 days contact) require the most extensive biocompatibility evaluation including chronic toxicity, implantation, degradation, genotoxicity, and carcinogenicity testing per ISO 10993-1 Table A.1. Verify all applicable endpoints are covered.',
            reference: 'ISO 10993-1:2018, Table A.1',
          },
        ],
        defaultNext: 'bench_performance',
      },

      {
        id: 'bench_performance',
        section: 'Preclinical Testing',
        question:
          'Describe the bench performance testing conducted for this device.',
        guidance:
          'Bench performance testing per 21 CFR 814.20(b)(3)(v) must demonstrate that the device meets its design specifications and performs safely under expected use conditions. Testing should include mechanical/structural performance, electrical safety (if applicable per IEC 60601-1), environmental testing, reliability, and durability. For implantable devices, fatigue testing and accelerated wear testing are typically required. All testing should follow applicable consensus standards and use validated test methods.',
        fields: [
          {
            id: 'bench_testing_summary',
            label: 'Bench Testing Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summarize all bench performance testing conducted, including test methods and results per 21 CFR 814.20(b)(3)(v)',
            validation: { minLength: 50 },
          },
          {
            id: 'mechanical_testing',
            label: 'Mechanical / Structural Performance Testing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Static and dynamic mechanical testing, structural integrity, dimensional verification',
          },
          {
            id: 'fatigue_testing',
            label: 'Fatigue / Durability Testing Completed',
            type: 'yes_no',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            helpText: 'Cyclic fatigue testing under simulated physiological conditions for implantable devices',
          },
          {
            id: 'electrical_safety_testing',
            label: 'Electrical Safety Testing Completed (IEC 60601-1)',
            type: 'yes_no',
            helpText: 'Required for electrically powered medical devices',
          },
          {
            id: 'environmental_testing',
            label: 'Environmental Testing Completed',
            type: 'yes_no',
            helpText: 'Temperature, humidity, vibration, shock, and transportation testing',
          },
          {
            id: 'applicable_standards',
            label: 'Applicable Consensus Standards',
            type: 'multi_select',
            options: [
              { value: 'iec_60601_1', label: 'IEC 60601-1 — General Safety for Medical Electrical Equipment' },
              { value: 'iec_60601_1_2', label: 'IEC 60601-1-2 — Electromagnetic Compatibility (EMC)' },
              { value: 'iso_14708', label: 'ISO 14708 — Active Implantable Medical Devices' },
              { value: 'astm_f2077', label: 'ASTM F2077 — Intervertebral Body Fusion Devices' },
              { value: 'astm_f1717', label: 'ASTM F1717 — Spinal Implant Constructs' },
              { value: 'astm_f2346', label: 'ASTM F2346 — Vascular Stents' },
              { value: 'iso_5840', label: 'ISO 5840 — Cardiovascular Implants — Heart Valves' },
              { value: 'iso_14243', label: 'ISO 14243 — Wear of Total Knee Joint Prostheses' },
              { value: 'iso_7206', label: 'ISO 7206 — Femoral Stems' },
              { value: 'other', label: 'Other Device-Specific Standards' },
            ],
          },
          {
            id: 'shelf_life_testing',
            label: 'Shelf Life / Aging Testing Completed',
            type: 'yes_no',
            helpText: 'Accelerated aging per ASTM F1980 and/or real-time aging to support the claimed shelf life',
          },
          {
            id: 'packaging_validation',
            label: 'Packaging Validation Completed (ISO 11607)',
            type: 'yes_no',
            helpText: 'Sterile barrier system validation including seal strength, package integrity, and transportation testing',
          },
        ],
        defaultNext: 'animal_studies',
      },

      {
        id: 'animal_studies',
        section: 'Preclinical Testing',
        question:
          'Describe any animal studies conducted in support of this PMA.',
        guidance:
          'Animal studies are typically required for Class III devices, particularly implantable devices, to evaluate safety, biocompatibility in vivo, and device performance under physiological conditions per 21 CFR 814.20(b)(3)(v). Studies must be conducted under Good Laboratory Practice (GLP) conditions per 21 CFR 58. The animal model should be justified as appropriate for the intended human use. Study design should include appropriate controls, sample sizes supported by statistical power analysis, and clinically relevant endpoints. Histopathological analysis of tissue surrounding implanted devices is typically expected.',
        fields: [
          {
            id: 'animal_studies_conducted',
            label: 'Animal Studies Conducted',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'animal_model',
            label: 'Animal Model Used',
            type: 'text',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            helpText: 'Specify the animal species and justification for its selection as an appropriate model',
          },
          {
            id: 'number_of_animals',
            label: 'Number of Animals',
            type: 'number',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            validation: { min: 1 },
            helpText: 'Include both test and control groups; justify sample size with statistical power analysis',
          },
          {
            id: 'study_duration',
            label: 'Study Duration',
            type: 'text',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            placeholder: 'e.g. 12 months',
            helpText: 'For implantable devices, chronic studies (6-12+ months) are typically required',
          },
          {
            id: 'glp_compliant',
            label: 'GLP Compliant (21 CFR 58)',
            type: 'yes_no',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            helpText: 'Pivotal animal studies must be conducted under Good Laboratory Practice conditions',
          },
          {
            id: 'implant_animal_histopathology',
            label: 'Histopathological Analysis of Implant Site',
            type: 'yes_no',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            helpText: 'Histopathological evaluation of tissue surrounding implanted devices is typically required for implant PMAs',
          },
          {
            id: 'animal_study_results',
            label: 'Animal Study Results Summary',
            type: 'textarea',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            helpText: 'Summarize key findings, complications, and conclusions from the animal studies',
          },
          {
            id: 'animal_study_justification',
            label: 'Justification if No Animal Studies',
            type: 'textarea',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: false },
            helpText: 'If animal studies were not conducted, provide scientific justification',
          },
        ],
        issueChecks: [
          {
            id: 'no_glp_animal_study_check',
            condition: { field: 'glp_compliant', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Non-GLP Animal Study',
            message:
              'Pivotal animal studies supporting a PMA should be conducted under Good Laboratory Practice (GLP) conditions per 21 CFR 58. Non-GLP studies may not be accepted by FDA as primary evidence of safety.',
            reference: '21 CFR 58',
          },
        ],
        defaultNext: 'clinical_study_overview',
      },

      /* ── 5. Clinical Evidence ─────────────────────────────────────── */

      {
        id: 'clinical_study_overview',
        section: 'Clinical Evidence',
        question:
          'Describe the clinical study or studies conducted in support of this PMA.',
        guidance:
          'Clinical data demonstrating reasonable assurance of safety and effectiveness is the cornerstone of the PMA application per 21 CFR 814.20(b)(3)(v)(A). Most PMA applications require at least one pivotal clinical study conducted under an Investigational Device Exemption (IDE) per 21 CFR 812. The clinical study must have adequate enrollment, appropriate endpoints, sufficient follow-up duration, and demonstrate statistically significant results. FDA may require a randomized controlled trial, or may accept a single-arm study with an objective performance criterion (OPC) for certain device types. Pre-submission meetings with FDA to agree on study design are strongly recommended for PMA clinical studies.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'clinical_study_conducted',
            label: 'Clinical Study Conducted in Support of PMA',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'ide_number',
            label: 'IDE Number',
            type: 'text',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: true },
            placeholder: 'e.g. G123456',
            helpText: 'Investigational Device Exemption number per 21 CFR 812',
          },
          {
            id: 'study_design',
            label: 'Study Design',
            type: 'select',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: true },
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial (RCT)' },
              { value: 'single_arm_opc', label: 'Single-Arm with Objective Performance Criterion (OPC)' },
              { value: 'single_arm_historical', label: 'Single-Arm with Historical Control' },
              { value: 'non_randomized_concurrent', label: 'Non-Randomized Concurrent Control' },
              { value: 'bayesian_adaptive', label: 'Bayesian Adaptive Design' },
              { value: 'crossover', label: 'Crossover' },
            ],
          },
          {
            id: 'number_of_sites',
            label: 'Number of Clinical Sites',
            type: 'number',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'total_enrollment',
            label: 'Total Subjects Enrolled',
            type: 'number',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: true },
            required: true,
            validation: { min: 1 },
            helpText: 'Include all enrolled subjects (treatment and control groups)',
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint',
            type: 'textarea',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: true },
            required: true,
            helpText: 'Define the primary effectiveness endpoint and success criterion',
          },
          {
            id: 'follow_up_duration',
            label: 'Follow-Up Duration',
            type: 'text',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: true },
            placeholder: 'e.g. 24 months',
            helpText: 'Duration of clinical follow-up; FDA may require long-term follow-up for implantable devices',
          },
          {
            id: 'clinical_no_study_justification',
            label: 'Justification for No Clinical Study',
            type: 'textarea',
            visibleWhen: { field: 'clinical_study_conducted', operator: 'eq', value: false },
            helpText: 'Explain why clinical data is not available or why a PMA can be supported without a pivotal clinical study',
          },
        ],
        issueChecks: [
          {
            id: 'no_clinical_data_class_iii_check',
            condition: { field: 'clinical_study_conducted', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Clinical Data for Class III Device',
            message:
              'PMA applications for Class III devices must include valid scientific evidence demonstrating reasonable assurance of safety and effectiveness, which typically requires clinical data per 21 CFR 814.20(b)(3)(v). A PMA without clinical data will almost certainly be found deficient unless extraordinary circumstances apply.',
            reference: '21 CFR 814.20(b)(3)(v)',
          },
        ],
        defaultNext: 'clinical_results',
      },

      {
        id: 'clinical_results',
        section: 'Clinical Evidence',
        question:
          'Present the clinical study results, including effectiveness and safety outcomes.',
        guidance:
          'FDA evaluates clinical results to determine whether there is reasonable assurance of safety and effectiveness per 21 CFR 814.44(d). The primary endpoint must be met with statistical significance. Include confidence intervals, p-values, and effect sizes. For superiority designs, demonstrate the treatment effect exceeds the null hypothesis. For non-inferiority designs, provide the non-inferiority margin and justification. Missing data handling, intention-to-treat (ITT) and per-protocol analyses, and sensitivity analyses should be clearly described.',
        fields: [
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'primary_effectiveness_results',
            label: 'Primary Effectiveness Results',
            type: 'textarea',
            required: true,
            helpText: 'Include point estimates, confidence intervals, p-values, and comparison to success criterion or control group',
            validation: { minLength: 50 },
          },
          {
            id: 'secondary_endpoints_results',
            label: 'Secondary Endpoint Results',
            type: 'textarea',
            helpText: 'Summarize results for all pre-specified secondary effectiveness endpoints',
          },
          {
            id: 'statistical_methods',
            label: 'Statistical Methods Used',
            type: 'textarea',
            required: true,
            helpText: 'Describe the statistical analysis plan, primary analysis method, multiplicity adjustments, and missing data handling',
          },
          {
            id: 'analysis_populations',
            label: 'Analysis Populations',
            type: 'multi_select',
            options: [
              { value: 'itt', label: 'Intention-to-Treat (ITT)' },
              { value: 'modified_itt', label: 'Modified Intention-to-Treat (mITT)' },
              { value: 'per_protocol', label: 'Per-Protocol (PP)' },
              { value: 'safety', label: 'Safety Population' },
            ],
          },
          {
            id: 'follow_up_completion_rate',
            label: 'Follow-Up Completion Rate (%)',
            type: 'number',
            validation: { min: 0, max: 100 },
            helpText: 'Percentage of enrolled subjects completing the required follow-up period',
          },
          {
            id: 'subgroup_analyses',
            label: 'Subgroup Analyses',
            type: 'textarea',
            helpText: 'Pre-specified subgroup analyses (age, sex, disease severity, etc.) and consistency of treatment effect',
          },
        ],
        issueChecks: [
          {
            id: 'primary_endpoint_not_met_check',
            condition: { field: 'primary_endpoint_met', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Primary Endpoint Not Met',
            message:
              'Failure to meet the primary effectiveness endpoint is a major obstacle to PMA approval. FDA will evaluate whether the totality of evidence supports reasonable assurance of effectiveness. Consider whether the study was adequately powered and whether secondary endpoints or subgroup analyses provide supportive evidence.',
            reference: '21 CFR 814.44(d)',
          },
        ],
        defaultNext: 'clinical_adverse_events',
      },

      {
        id: 'clinical_adverse_events',
        section: 'Clinical Evidence',
        question:
          'Describe the adverse events and safety outcomes from the clinical study.',
        guidance:
          'A thorough accounting of adverse events is required per 21 CFR 814.20(b)(3)(v). Include all adverse events (device-related and non-device-related), unanticipated adverse device effects (UADEs), serious adverse events (SAEs), and device deficiencies. Provide rates in both treatment and control groups (if applicable). FDA will evaluate the overall safety profile including the risk-benefit assessment. Deaths and serious adverse events require detailed narratives.',
        fields: [
          {
            id: 'total_adverse_events',
            label: 'Total Number of Adverse Events',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'device_related_ae_rate',
            label: 'Device-Related Adverse Event Rate (%)',
            type: 'number',
            required: true,
            validation: { min: 0, max: 100 },
          },
          {
            id: 'serious_adverse_events',
            label: 'Serious Adverse Events (SAEs) Summary',
            type: 'textarea',
            required: true,
            helpText: 'List all SAEs with frequency, severity, relatedness to device, and outcome',
          },
          {
            id: 'unanticipated_adverse_effects',
            label: 'Unanticipated Adverse Device Effects (UADEs)',
            type: 'textarea',
            helpText: 'Describe any adverse device effects that were not identified in the investigational plan',
          },
          {
            id: 'deaths_reported',
            label: 'Deaths Reported During Study',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'death_narratives',
            label: 'Death Narratives',
            type: 'textarea',
            visibleWhen: { field: 'deaths_reported', operator: 'gt', value: 0 },
            helpText: 'Provide detailed narratives for all deaths including cause, timeline, and relationship to device',
          },
          {
            id: 'device_deficiencies',
            label: 'Device Deficiencies / Malfunctions',
            type: 'textarea',
            helpText: 'Describe device failures, malfunctions, or deficiencies observed during the study',
          },
          {
            id: 'risk_benefit_conclusion',
            label: 'Risk-Benefit Conclusion',
            type: 'textarea',
            required: true,
            helpText: 'Summarize the overall risk-benefit assessment supporting the safety of the device',
            validation: { minLength: 30 },
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'software_documentation',
          },
        ],
        defaultNext: 'labeling_review',
      },

      /* ── 6. Software & Cybersecurity ──────────────────────────────── */

      {
        id: 'software_documentation',
        section: 'Software & Cybersecurity',
        question:
          'Describe the software documentation and lifecycle processes for this device.',
        guidance:
          'For PMA devices containing software, FDA requires comprehensive software documentation per IEC 62304 (Medical Device Software Lifecycle) and FDA\'s 2023 guidance on Content of Premarket Submissions for Device Software Functions. The software safety classification (Class A, B, or C) per IEC 62304 determines the required level of documentation. All software development must follow a documented software development lifecycle (SDLC) with requirements management, architecture documentation, detailed design, implementation, verification, and validation. Software of Unknown Provenance (SOUP) / off-the-shelf (OTS) components must be risk-assessed.',
        fields: [
          {
            id: 'iec_62304_class',
            label: 'IEC 62304 Software Safety Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_a', label: 'Class A — No injury or damage to health possible' },
              { value: 'class_b', label: 'Class B — Non-serious injury possible' },
              { value: 'class_c', label: 'Class C — Death or serious injury possible' },
            ],
            helpText: 'Classification per IEC 62304:2006+AMD1:2015 based on severity of hazardous situations',
          },
          {
            id: 'is_samd',
            label: 'Is this Software as a Medical Device (SaMD)?',
            type: 'yes_no',
            required: true,
            helpText: 'Software that is itself a medical device per IMDRF framework, not embedded in a hardware device',
          },
          {
            id: 'software_requirements_documented',
            label: 'Software Requirements Specification (SRS) Documented',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'software_architecture_documented',
            label: 'Software Architecture Design Documented',
            type: 'yes_no',
            required: true,
            helpText: 'Required for IEC 62304 Class B and C software',
          },
          {
            id: 'software_validation_complete',
            label: 'Software Validation Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Software validation confirming the finished software meets user needs and intended uses',
          },
          {
            id: 'traceability_matrix_complete',
            label: 'Requirements Traceability Matrix Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Matrix linking user needs to software requirements to design to verification to validation',
          },
          {
            id: 'ai_ml_enabled',
            label: 'Does the software use AI/ML?',
            type: 'yes_no',
            helpText: 'AI/ML-enabled devices may require a predetermined change control plan per FDA guidance',
          },
          {
            id: 'soup_ots_components',
            label: 'SOUP/OTS Components Risk Assessment Completed',
            type: 'yes_no',
            helpText: 'Software of Unknown Provenance and off-the-shelf components must be risk-assessed per IEC 62304',
          },
        ],
        issueChecks: [
          {
            id: 'software_validation_gap_check',
            condition: { field: 'software_validation_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Software Validation Gaps',
            message:
              'Software validation is required for all PMA devices containing software per IEC 62304 and 21 CFR 820.30(g). A PMA submission with incomplete software validation will be found deficient. Software validation must confirm the finished device software meets user needs and intended uses.',
            reference: 'IEC 62304:2006+AMD1:2015; 21 CFR 820.30(g)',
          },
          {
            id: 'no_traceability_check',
            condition: { field: 'traceability_matrix_complete', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Incomplete Requirements Traceability',
            message:
              'A complete requirements traceability matrix is expected for PMA software documentation. The matrix must link user needs through software requirements, design, verification, and validation per IEC 62304 and FDA guidance.',
            reference: 'IEC 62304; FDA Guidance: Content of Premarket Submissions for Device Software Functions (2023)',
          },
        ],
        defaultNext: 'cybersecurity_assessment',
      },

      {
        id: 'cybersecurity_assessment',
        section: 'Software & Cybersecurity',
        question:
          'Describe the cybersecurity assessment and controls for this device.',
        guidance:
          'FDA\'s 2023 guidance "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions" requires comprehensive cybersecurity documentation for all devices with software that connect to networks, exchange data, or can be updated. This includes a Software Bill of Materials (SBOM), threat modeling (using STRIDE, MITRE ATT&CK, or equivalent), vulnerability management, penetration testing, and a total product lifecycle cybersecurity plan. Under Section 524B of the FD&C Act (enacted via PATCH Act), cybersecurity documentation is now a statutory requirement for premarket submissions.',
        fields: [
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
            id: 'sbom_prepared',
            label: 'Software Bill of Materials (SBOM) Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'Required per FDA 2023 Cybersecurity Guidance and Section 524B of the FD&C Act',
          },
          {
            id: 'threat_model_completed',
            label: 'Threat Model Completed',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
            helpText: 'Threat model per STRIDE, MITRE ATT&CK, or equivalent methodology',
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
              { value: 'anomaly_detection', label: 'Anomaly / Intrusion Detection' },
            ],
          },
          {
            id: 'penetration_testing',
            label: 'Penetration Testing Completed',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
            helpText: 'Third-party penetration testing is recommended for connected PMA devices',
          },
          {
            id: 'vulnerability_management_plan',
            label: 'Vulnerability Management and Disclosure Plan',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
            helpText: 'Plan for monitoring, identifying, and remediating cybersecurity vulnerabilities post-market',
          },
          {
            id: 'cybersecurity_lifecycle_plan',
            label: 'Total Product Lifecycle Cybersecurity Plan',
            type: 'yes_no',
            visibleWhen: { field: 'network_connected', operator: 'eq', value: true },
            helpText: 'Comprehensive plan for maintaining device cybersecurity throughout the product lifecycle',
          },
        ],
        issueChecks: [
          {
            id: 'connected_no_cyber_assessment_check',
            condition: { field: 'cybersecurity_risk_assessment', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Connected Device Without Cybersecurity Assessment',
            message:
              'FDA\'s 2023 Cybersecurity Guidance and Section 524B of the FD&C Act require a comprehensive cybersecurity risk assessment for all connected devices. PMA submissions without adequate cybersecurity documentation will be refused.',
            reference: 'FDA Guidance: Cybersecurity in Medical Devices (2023); FD&C Act Section 524B',
          },
          {
            id: 'no_sbom_check',
            condition: { field: 'sbom_prepared', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Software Bill of Materials (SBOM)',
            message:
              'A Software Bill of Materials (SBOM) is required per Section 524B of the FD&C Act and FDA\'s 2023 Cybersecurity Guidance. The SBOM must list all software components including commercial, open-source, and off-the-shelf (OTS) software.',
            reference: 'FDA Guidance: Cybersecurity in Medical Devices (2023)',
          },
        ],
        defaultNext: 'labeling_review',
      },

      /* ── 7. Labeling & Human Factors ──────────────────────────────── */

      {
        id: 'labeling_review',
        section: 'Labeling & Human Factors',
        question:
          'Describe the device labeling and its compliance with regulatory requirements.',
        guidance:
          'PMA labeling must comply with 21 CFR 814.20(b)(10) and 21 CFR 801. FDA reviews the proposed labeling as part of the PMA application and labeling becomes a condition of approval. Labeling includes the device label, instructions for use (IFU), patient labeling (if applicable), and physician/surgical technique guides. The Unique Device Identifier (UDI) is required per 21 CFR 830. For implantable devices, patient identification cards and implant tracking requirements under 21 CFR 821 may apply.',
        fields: [
          {
            id: 'labeling_prepared',
            label: 'Proposed Labeling Prepared per 21 CFR 814.20(b)(10)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'labeling_components',
            label: 'Labeling Components Included',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'device_label', label: 'Device Label' },
              { value: 'ifu', label: 'Instructions for Use (IFU)' },
              { value: 'physician_guide', label: 'Physician / Clinician Guide' },
              { value: 'surgical_technique', label: 'Surgical Technique Guide' },
              { value: 'patient_labeling', label: 'Patient Labeling / Information' },
              { value: 'quick_reference', label: 'Quick Reference / Setup Guide' },
              { value: 'training_materials', label: 'Training Materials' },
            ],
          },
          {
            id: 'labeling_content',
            label: 'Labeling Content Includes',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'indications', label: 'Indications for Use' },
              { value: 'contraindications', label: 'Contraindications' },
              { value: 'warnings', label: 'Warnings' },
              { value: 'precautions', label: 'Precautions' },
              { value: 'adverse_events', label: 'Adverse Events / Complications' },
              { value: 'directions_for_use', label: 'Directions for Use' },
              { value: 'storage_handling', label: 'Storage and Handling' },
              { value: 'mri_safety', label: 'MRI Safety Information' },
            ],
          },
          {
            id: 'udi_assigned',
            label: 'Unique Device Identifier (UDI) Assigned',
            type: 'yes_no',
            required: true,
            helpText: 'Required per 21 CFR 830 for Class III devices',
          },
          {
            id: 'implant_tracking',
            label: 'Implant Tracking Requirements Addressed (21 CFR 821)',
            type: 'yes_no',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            helpText: 'FDA may require tracking of implantable devices under 21 CFR 821',
          },
          {
            id: 'mri_conditional_labeling',
            label: 'MRI Conditional / MR Safe Labeling',
            type: 'select',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            options: [
              { value: 'mr_safe', label: 'MR Safe' },
              { value: 'mr_conditional', label: 'MR Conditional' },
              { value: 'mr_unsafe', label: 'MR Unsafe' },
              { value: 'not_evaluated', label: 'Not Evaluated' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
            helpText: 'MRI labeling per ASTM F2503 is required for implantable devices',
          },
        ],
        issueChecks: [
          {
            id: 'no_labeling_check',
            condition: { field: 'labeling_prepared', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Labeling Not Prepared',
            message:
              'Proposed labeling is a required component of the PMA application per 21 CFR 814.20(b)(10). A PMA submission without proposed labeling will be refused to file.',
            reference: '21 CFR 814.20(b)(10)',
          },
        ],
        defaultNext: 'human_factors_engineering',
      },

      {
        id: 'human_factors_engineering',
        section: 'Labeling & Human Factors',
        question:
          'Describe the human factors engineering and usability activities for this device.',
        guidance:
          'FDA\'s guidance "Applying Human Factors and Usability Engineering to Medical Devices" (2016) and IEC 62366-1 (Usability Engineering) require that device manufacturers apply human factors engineering to demonstrate the device can be used safely and effectively by the intended users in the intended use environments. For Class III PMA devices, summative (validation) usability testing is strongly recommended and typically expected. Critical tasks must be identified through use-related risk analysis. The summative study should use representative users performing critical tasks in a simulated use environment.',
        fields: [
          {
            id: 'iec_62366_applied',
            label: 'IEC 62366-1 Usability Engineering Applied',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'use_related_risk_analysis',
            label: 'Use-Related Risk Analysis Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Identification of use-related hazards and analysis of use errors that could cause harm',
          },
          {
            id: 'critical_tasks_identified',
            label: 'Critical Tasks Identified',
            type: 'yes_no',
            required: true,
            helpText: 'Tasks where use error could lead to serious harm or death',
          },
          {
            id: 'number_of_critical_tasks',
            label: 'Number of Critical Tasks',
            type: 'number',
            visibleWhen: { field: 'critical_tasks_identified', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'formative_studies',
            label: 'Formative Usability Studies Completed',
            type: 'yes_no',
            helpText: 'Iterative design evaluation studies (cognitive walkthroughs, heuristic evaluations, simulated use)',
          },
          {
            id: 'summative_testing',
            label: 'Summative (HFE Validation) Testing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Final validation testing with representative users performing critical tasks in simulated use environment',
          },
          {
            id: 'summative_participants',
            label: 'Number of Summative Test Participants',
            type: 'number',
            visibleWhen: { field: 'summative_testing', operator: 'eq', value: true },
            validation: { min: 1 },
            helpText: 'FDA typically expects 15+ participants per distinct user group',
          },
          {
            id: 'user_groups',
            label: 'Intended User Groups',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'surgeon', label: 'Surgeon / Interventionalist' },
              { value: 'physician', label: 'Physician (non-surgical)' },
              { value: 'nurse', label: 'Nurse / Clinical Staff' },
              { value: 'patient', label: 'Patient / Lay User' },
              { value: 'caregiver', label: 'Caregiver' },
              { value: 'technician', label: 'Technician / Biomedical Engineer' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_summative_testing_check',
            condition: { field: 'summative_testing', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Summative Human Factors Testing',
            message:
              'For Class III PMA devices, FDA strongly expects summative human factors validation testing demonstrating that the device can be used safely and effectively by the intended users. The absence of summative HFE data may result in a Major Deficiency letter or Additional Information request.',
            reference: 'FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices (2016); IEC 62366-1',
          },
          {
            id: 'no_urra_check',
            condition: { field: 'use_related_risk_analysis', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Use-Related Risk Analysis',
            message:
              'A use-related risk analysis is foundational to the human factors engineering process and is required to identify critical tasks and use-related hazards per IEC 62366-1.',
            reference: 'IEC 62366-1:2015+AMD1:2020',
          },
        ],
        defaultNext: 'post_market_plan',
      },

      /* ── 8. Post-Market Surveillance ──────────────────────────────── */

      {
        id: 'post_market_plan',
        section: 'Post-Market Surveillance',
        question:
          'Describe the post-market surveillance and reporting plans for this device.',
        guidance:
          'Post-market surveillance is a regulatory requirement for all PMA devices per 21 CFR 814.82. PMA holders must submit periodic reports (annual reports) per 21 CFR 814.84 summarizing safety and effectiveness data. Medical Device Reporting (MDR) per 21 CFR 803 is mandatory for deaths, serious injuries, and malfunctions. FDA may also impose post-approval studies (PAS) as a condition of PMA approval per 21 CFR 814.82(a)(2). A comprehensive post-market surveillance plan should include complaint handling, MDR, trending analysis, and procedures for PMA supplements for device modifications.',
        fields: [
          {
            id: 'post_market_plan_developed',
            label: 'Post-Market Surveillance Plan Developed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'complaint_handling_system',
            label: 'Complaint Handling System Established',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.198 — procedures for receiving, reviewing, and evaluating complaints',
          },
          {
            id: 'mdr_procedure',
            label: 'MDR (Medical Device Reporting) Procedure in Place',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 803 — reporting of deaths, serious injuries, and malfunctions',
          },
          {
            id: 'post_approval_study_anticipated',
            label: 'Post-Approval Study (PAS) Anticipated',
            type: 'yes_no',
            helpText: 'FDA may require post-approval studies as a condition of PMA approval per 21 CFR 814.82(a)(2)',
          },
          {
            id: 'pas_description',
            label: 'Post-Approval Study Description',
            type: 'textarea',
            visibleWhen: { field: 'post_approval_study_anticipated', operator: 'eq', value: true },
            helpText: 'Describe the anticipated post-approval study design, endpoints, enrollment, and duration',
          },
          {
            id: 'annual_report_plan',
            label: 'Annual Report Process Planned (21 CFR 814.84)',
            type: 'yes_no',
            required: true,
            helpText: 'PMA holders must submit annual reports summarizing safety and effectiveness information',
          },
          {
            id: 'corrections_removals_plan',
            label: 'Corrections and Removals Plan Established',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 806 — procedures for recalls, field corrections, and removal of devices',
          },
          {
            id: 'trending_analysis',
            label: 'Complaint/MDR Trending Analysis Plan',
            type: 'yes_no',
            helpText: 'Systematic analysis of complaint and MDR trends to identify emerging safety signals',
          },
        ],
        issueChecks: [
          {
            id: 'no_post_market_plan_check',
            condition: { field: 'post_market_plan_developed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Post-Market Surveillance Plan',
            message:
              'A post-market surveillance plan is expected for PMA devices per 21 CFR 814.82. FDA may impose post-approval studies and periodic reporting requirements as conditions of approval.',
            reference: '21 CFR 814.82; 21 CFR 814.84',
          },
        ],
        defaultNext: 'risk_management_summary',
      },

      {
        id: 'risk_management_summary',
        section: 'Post-Market Surveillance',
        question:
          'Provide a summary of the risk management process and overall risk-benefit determination.',
        guidance:
          'ISO 14971:2019 (Risk Management for Medical Devices) is the recognized standard for risk management and is expected for all PMA submissions. The risk management file should document the complete risk management process including hazard identification, risk estimation and evaluation, risk control implementation and verification, and evaluation of overall residual risk acceptability. For PMA devices, the risk-benefit determination is central to FDA\'s approval decision per 21 CFR 814.44(d) — FDA must find that there is reasonable assurance of safety and effectiveness, weighing the probable benefits against the probable risks.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'iso_14971_applied',
            label: 'ISO 14971 Risk Management Process Applied',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'risk_analysis_methods',
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
              { value: 'use_fmea', label: 'Use FMEA (Use-Related Risk Analysis)' },
            ],
          },
          {
            id: 'number_identified_hazards',
            label: 'Number of Identified Hazards',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'risk_acceptability_criteria',
            label: 'Risk Acceptability Criteria Defined',
            type: 'yes_no',
            required: true,
            helpText: 'Risk acceptability matrix with severity and probability levels per ISO 14971',
          },
          {
            id: 'residual_risks_acceptable',
            label: 'All Residual Risks Acceptable',
            type: 'yes_no',
            required: true,
            helpText: 'After risk control measures, are all individual and overall residual risks acceptable?',
          },
          {
            id: 'risk_benefit_analysis',
            label: 'Risk-Benefit Analysis Summary',
            type: 'textarea',
            required: true,
            helpText: 'Overall risk-benefit determination per ISO 14971 and 21 CFR 814.44(d)',
            validation: { minLength: 50 },
          },
          {
            id: 'residual_risk_disclosure',
            label: 'Residual Risks Disclosed in Labeling',
            type: 'yes_no',
            helpText: 'Residual risks must be disclosed to users through labeling per ISO 14971:2019',
          },
        ],
        issueChecks: [
          {
            id: 'no_iso_14971_check',
            condition: { field: 'iso_14971_applied', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No ISO 14971 Risk Management',
            message:
              'ISO 14971 risk management is a recognized consensus standard expected by FDA for all PMA submissions. The absence of a documented risk management process is a significant deficiency that will impede PMA approval.',
            reference: 'ISO 14971:2019',
          },
          {
            id: 'unacceptable_residual_risks_check',
            condition: { field: 'residual_risks_acceptable', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Unacceptable Residual Risks',
            message:
              'Unacceptable residual risks must be addressed through additional risk control measures or a documented risk-benefit analysis per ISO 14971. FDA will evaluate whether the probable benefits outweigh the probable risks per 21 CFR 814.44(d).',
            reference: 'ISO 14971:2019; 21 CFR 814.44(d)',
          },
        ],
        defaultNext: 'manufacturing_post_approval',
      },

      {
        id: 'manufacturing_post_approval',
        section: 'Post-Market Surveillance',
        question:
          'Describe the post-approval manufacturing and change management plans.',
        guidance:
          'After PMA approval, any change to the device that could affect safety or effectiveness requires a PMA supplement per 21 CFR 814.39. Changes are categorized as Panel-Track supplements (significant changes), 180-day supplements (design, manufacturing, or labeling changes), Real-Time supplements (minor changes), or 30-day notices (editorial/minor changes). The PMA holder must maintain the manufacturing quality system and be prepared for routine FDA inspections. Manufacturing site changes, supplier changes, and design modifications all require appropriate PMA supplement filings.',
        fields: [
          {
            id: 'pma_supplement_procedures',
            label: 'PMA Supplement Filing Procedures Established',
            type: 'yes_no',
            required: true,
            helpText: 'Procedures for determining when device changes require PMA supplements per 21 CFR 814.39',
          },
          {
            id: 'change_control_system',
            label: 'Change Control System in Place',
            type: 'yes_no',
            required: true,
            helpText: 'Formal change control process per 21 CFR 820.30(i) for evaluating and documenting all device changes',
          },
          {
            id: 'supplier_change_management',
            label: 'Supplier Change Management Process',
            type: 'yes_no',
            required: true,
            helpText: 'Process for evaluating and qualifying alternative suppliers or material changes post-approval',
          },
          {
            id: 'manufacturing_scale_up_plan',
            label: 'Manufacturing Scale-Up Plan',
            type: 'textarea',
            helpText: 'Describe plans for scaling manufacturing from clinical production to commercial volumes',
          },
          {
            id: 'routine_inspection_readiness',
            label: 'Routine FDA Inspection Readiness',
            type: 'select',
            required: true,
            options: [
              { value: 'ready', label: 'Ready for Routine Inspections' },
              { value: 'preparing', label: 'Preparing for Routine Inspections' },
              { value: 'not_ready', label: 'Not Yet Ready' },
            ],
            helpText: 'FDA conducts biennial inspections of PMA device manufacturers',
          },
          {
            id: 'field_service_plan',
            label: 'Field Service and Maintenance Plan',
            type: 'yes_no',
            helpText: 'For devices requiring installation, calibration, or periodic maintenance by trained personnel',
          },
        ],
        issueChecks: [
          {
            id: 'no_supplement_procedures_check',
            condition: { field: 'pma_supplement_procedures', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No PMA Supplement Procedures',
            message:
              'PMA holders must have procedures for determining when device changes require PMA supplements per 21 CFR 814.39. Failure to file required supplements can result in enforcement action.',
            reference: '21 CFR 814.39',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
