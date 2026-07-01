/**
 * PMA (Premarket Approval) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides medtech sponsors through a comprehensive PMA submission
 * questionnaire covering device description, manufacturing, preclinical
 * testing, clinical evidence, statistical analysis, labeling, risk
 * analysis, post-market requirements, and FDA submission strategy
 * per 21 CFR 814.
 *
 * 25 nodes · 100+ fields · 9 sections · 16 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/device-pma
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createDevicePmaFlow(): FlowDefinition {
  return {
    id: 'device-pma-v1',
    category: 'device_pma',
    name: 'PMA Submission',
    description:
      'Premarket Approval Application questionnaire for Class III devices covering device description, manufacturing, preclinical testing, clinical evidence, and FDA submission strategy per 21 CFR 814.',
    clientTypes: ['medtech'],
    entryNode: 'pma_overview',
    estimatedMinutes: 50,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'pma_overview_section',
        label: 'PMA Overview',
        nodeIds: ['pma_overview', 'device_description'],
      },
      {
        id: 'manufacturing_section',
        label: 'Manufacturing',
        nodeIds: ['manufacturing_process', 'quality_system', 'sterilization_validation'],
      },
      {
        id: 'preclinical_section',
        label: 'Preclinical Testing',
        nodeIds: ['bench_testing', 'biocompatibility_eval', 'sw_electrical_emc'],
      },
      {
        id: 'clinical_evidence_section',
        label: 'Clinical Evidence',
        nodeIds: ['clinical_study_design', 'clinical_results', 'clinical_safety'],
      },
      {
        id: 'statistical_analysis_section',
        label: 'Statistical Analysis',
        nodeIds: ['sample_size_stats', 'analysis_methods'],
      },
      {
        id: 'labeling_section',
        label: 'Labeling',
        nodeIds: ['proposed_labeling', 'patient_labeling'],
      },
      {
        id: 'risk_analysis_section',
        label: 'Risk Analysis',
        nodeIds: ['risk_management_pma', 'risk_benefit'],
      },
      {
        id: 'post_market_section',
        label: 'Post-Market',
        nodeIds: ['post_approval_study', 'post_market_surveillance'],
      },
      {
        id: 'submission_strategy_section',
        label: 'Submission Strategy',
        nodeIds: ['pre_submission', 'submission_planning', 'panel_preparation'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — PMA Overview                                        */
      /* ================================================================ */

      {
        id: 'pma_overview',
        section: 'PMA Overview',
        question:
          'Let\'s begin with the PMA application overview. What type of PMA submission is this, and what is the device intended for?',
        guidance:
          'Per 21 CFR 814.20, a PMA application must contain sufficient information to demonstrate that the device is safe and effective for its intended use. The PMA type determines the review pathway and required content. Original PMAs require the full evidentiary package per 21 CFR 814.20(b). Panel-track supplements (21 CFR 814.39(e)) are used for significant changes in indication, labeling, or design. 180-day supplements (21 CFR 814.39(d)) cover changes that affect safety or effectiveness. Real-time supplements (21 CFR 814.39(f)) address minor manufacturing changes. 30-day notices (21 CFR 814.39(g)) are for editorial or minor labeling changes.',
        fields: [
          {
            id: 'pma_type',
            label: 'PMA Submission Type',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original PMA', description: '21 CFR 814.20 — full application for new Class III device' },
              { value: 'panel_track', label: 'Panel-Track Supplement', description: '21 CFR 814.39(e) — significant change in indication or design' },
              { value: '180_day', label: '180-Day Supplement', description: '21 CFR 814.39(d) — change affecting safety or effectiveness' },
              { value: 'real_time', label: 'Real-Time Supplement', description: '21 CFR 814.39(f) — minor manufacturing change' },
              { value: '30_day_notice', label: '30-Day Notice', description: '21 CFR 814.39(g) — editorial or minor labeling change' },
            ],
          },
          {
            id: 'device_trade_name',
            label: 'Device Trade Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., CardioFlow Transcatheter Valve System',
          },
          {
            id: 'device_common_name',
            label: 'Device Common Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., Transcatheter aortic valve replacement prosthesis',
            helpText: 'The generic descriptor used by FDA to categorize the device.',
          },
          {
            id: 'intended_use_statement',
            label: 'Intended Use / Indications for Use Statement',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The CardioFlow System is indicated for relief of aortic stenosis in patients who are at high or greater risk for open-heart surgery...',
            helpText: 'Per 21 CFR 814.20(b)(3)(i), the PMA must include a statement of the intended use, including a description of the disease or condition the device is intended to diagnose, treat, or prevent.',
            validation: { minLength: 50 },
          },
          {
            id: 'classification_panel',
            label: 'Class III Classification Panel',
            type: 'select',
            required: true,
            options: [
              { value: 'cardiovascular', label: 'Cardiovascular (CV)' },
              { value: 'orthopedic', label: 'Orthopedic (OR)' },
              { value: 'neurological', label: 'Neurological (NE)' },
              { value: 'general_hospital', label: 'General Hospital (GH)' },
              { value: 'gastroenterology_urology', label: 'Gastroenterology-Urology (GU)' },
              { value: 'ophthalmic', label: 'Ophthalmic (OP)' },
              { value: 'ear_nose_throat', label: 'Ear, Nose and Throat (EN)' },
              { value: 'radiology', label: 'Radiology (RA)' },
              { value: 'general_plastic_surgery', label: 'General and Plastic Surgery (SU)' },
              { value: 'dental', label: 'Dental (DE)' },
              { value: 'immunology', label: 'Immunology (IM)' },
              { value: 'clinical_chemistry', label: 'Clinical Chemistry (CH)' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        defaultNext: 'device_description',
        provideExpertFeedback: true,
      },

      {
        id: 'device_description',
        section: 'PMA Overview',
        question:
          'Provide a detailed description of the device, including its product code, components, materials, and energy source.',
        guidance:
          'Per 21 CFR 814.20(b)(3), the PMA must include a complete description of the device, including pictorial representations, engineering drawings, and the principles of operation. All device components, materials of construction, and energy sources must be described. If the device contains software, a description of the software functions and architecture is required per FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023). The product code and regulation number link the device to its classification under 21 CFR Parts 862-892.',
        fields: [
          {
            id: 'device_description_detail',
            label: 'Detailed Device Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The device consists of a self-expanding nitinol frame with bovine pericardial tissue leaflets, a delivery catheter system, and a loading tool...',
            validation: { minLength: 100 },
          },
          {
            id: 'product_code',
            label: 'Product Code',
            type: 'text',
            required: true,
            helpText: 'FDA 3-letter product code from the Product Classification Database.',
          },
          {
            id: 'regulation_number',
            label: 'Regulation Number',
            type: 'text',
            required: true,
            placeholder: 'e.g., 21 CFR 870.3925',
          },
          {
            id: 'fda_advisory_panel',
            label: 'FDA Advisory Panel',
            type: 'text',
            placeholder: 'e.g., Circulatory System Devices Advisory Panel',
            helpText: 'The relevant FDA advisory committee that may review this PMA per 21 CFR 814.44.',
          },
          {
            id: 'device_components',
            label: 'Device Components',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., 1) Prosthetic valve assembly, 2) Delivery catheter (inner and outer), 3) Handle with flush ports, 4) Loading tool, 5) Introducer sheath',
          },
          {
            id: 'materials_of_construction',
            label: 'Materials of Construction',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Nitinol (NiTi alloy) frame, glutaraldehyde-fixed bovine pericardium, polyester skirt, PTFE sutures, stainless steel crimping components',
            helpText: 'Per 21 CFR 814.20(b)(3)(ii), list all materials contacting patient tissue or blood.',
          },
          {
            id: 'energy_source',
            label: 'Energy Source',
            type: 'select',
            options: [
              { value: 'none', label: 'None — passive device' },
              { value: 'battery', label: 'Battery-powered' },
              { value: 'ac_mains', label: 'AC mains powered' },
              { value: 'radiofrequency', label: 'Radiofrequency' },
              { value: 'laser', label: 'Laser' },
              { value: 'ultrasound', label: 'Ultrasound' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'has_software',
            label: 'Does the device contain software?',
            type: 'yes_no',
            required: true,
            helpText: 'If yes, software documentation per FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023) and IEC 62304 is required.',
          },
        ],
        defaultNext: 'manufacturing_process',
      },

      /* ================================================================ */
      /*  Section 2 — Manufacturing                                       */
      /* ================================================================ */

      {
        id: 'manufacturing_process',
        section: 'Manufacturing',
        question:
          'Describe the manufacturing process, including manufacturing sites and any contract manufacturers involved.',
        guidance:
          'Per 21 CFR 814.20(b)(4) and 21 CFR 820 (Quality System Regulation), the PMA must include a complete description of the methods, facilities, and controls used for manufacturing, processing, packing, storage, and installation of the device. All manufacturing sites must be registered with FDA per 21 CFR 807 and are subject to pre-approval inspection (PAI) per FDA Compliance Program 7382.845. Contract manufacturers must be identified and their quality agreements documented per 21 CFR 820.50.',
        fields: [
          {
            id: 'manufacturing_description',
            label: 'Manufacturing Process Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Device manufactured through a multi-step process including machining, laser cutting, electropolishing, tissue processing, assembly, and final testing...',
            validation: { minLength: 50 },
          },
          {
            id: 'manufacturing_sites',
            label: 'Manufacturing Sites',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Site 1: Primary assembly — Acme Medical, Minneapolis, MN (FEI: 1234567). Site 2: Nitinol frame machining — AlloyTech, San Jose, CA (FEI: 7654321).',
            helpText: 'List all sites with FDA Establishment Identifier (FEI) numbers per 21 CFR 807.',
          },
          {
            id: 'contract_manufacturers',
            label: 'Contract Manufacturers',
            type: 'textarea',
            placeholder: 'e.g., TissueProc LLC — bovine pericardium processing. MetalWorks Inc. — nitinol frame laser cutting and electropolishing.',
            helpText: 'Per 21 CFR 820.50, suppliers and contractors must be evaluated and quality agreements must be in place.',
          },
        ],
        defaultNext: 'quality_system',
      },

      {
        id: 'quality_system',
        section: 'Manufacturing',
        question:
          'Describe the quality system compliance status, including design controls, verification, and validation per 21 CFR 820.',
        guidance:
          'Per 21 CFR 820 (Quality System Regulation), Class III devices must have a comprehensive quality system. Design controls (21 CFR 820.30) require a documented design history file (DHF) including design inputs, outputs, review, verification, validation, and transfer. Design verification (21 CFR 820.30(f)) confirms design outputs meet input requirements. Design validation (21 CFR 820.30(g)) confirms the device meets user needs and intended uses under actual or simulated conditions. A corrective and preventive action (CAPA) system per 21 CFR 820.90 must be operational.',
        fields: [
          {
            id: 'qsr_compliance',
            label: '21 CFR 820 QSR Compliance Status',
            type: 'select',
            required: true,
            options: [
              { value: 'fully_compliant', label: 'Fully compliant — QMS certified / audited' },
              { value: 'substantially_compliant', label: 'Substantially compliant — minor gaps identified' },
              { value: 'in_progress', label: 'In progress — QMS implementation underway' },
              { value: 'not_compliant', label: 'Not yet compliant' },
            ],
          },
          {
            id: 'design_controls_completed',
            label: 'Design Controls Completed (Design History File)',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.30, a complete Design History File (DHF) must document the entire design and development process.',
          },
          {
            id: 'design_verification_completed',
            label: 'Design Verification Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.30(f), design verification confirms that design outputs meet design input requirements through inspection, analysis, or testing.',
          },
          {
            id: 'design_validation_completed',
            label: 'Design Validation Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.30(g), design validation confirms the device meets user needs under actual or simulated use conditions, including software validation and clinical evidence.',
          },
          {
            id: 'capa_system',
            label: 'CAPA System Operational',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.90, a Corrective and Preventive Action system must be established and maintained.',
          },
        ],
        issueChecks: [
          {
            id: 'no_design_controls',
            condition: { field: 'design_controls_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Design Controls Not Completed',
            message:
              'Design controls per 21 CFR 820.30 are mandatory for Class III devices. The Design History File (DHF) must document the complete design process, including inputs, outputs, reviews, verification, and validation. A PMA cannot be approved without evidence of design control compliance.',
            reference: '21 CFR 820.30',
          },
          {
            id: 'no_design_validation',
            condition: { field: 'design_validation_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Design Validation Not Completed',
            message:
              'Design validation per 21 CFR 820.30(g) must demonstrate that the device conforms to defined user needs and intended uses under actual or simulated conditions. This typically includes clinical evaluation and is a key requirement for PMA approval.',
            reference: '21 CFR 820.30(g)',
          },
        ],
        defaultNext: 'sterilization_validation',
      },

      {
        id: 'sterilization_validation',
        section: 'Manufacturing',
        question:
          'Describe the sterilization method and validation status for the device.',
        guidance:
          'Per 21 CFR 820.75, when sterilization is used, the sterilization process must be validated. ISO 11135 (ethylene oxide), ISO 11137 (radiation), ISO 17665 (moist heat), and ISO 13408 (aseptic processing) provide recognized standards for sterilization validation. Environmental controls per ISO 14644 for cleanroom classification must be documented. FDA Guidance "Submission and Review of Sterility Information in Premarket Notification (510(k)) Submissions for Devices Labeled as Sterile" (2016) also applies to PMA submissions.',
        fields: [
          {
            id: 'sterilization_method',
            label: 'Sterilization Method',
            type: 'select',
            required: true,
            options: [
              { value: 'eto', label: 'Ethylene Oxide (EtO) — ISO 11135' },
              { value: 'gamma', label: 'Gamma Radiation — ISO 11137' },
              { value: 'e_beam', label: 'Electron Beam — ISO 11137' },
              { value: 'steam', label: 'Steam / Moist Heat — ISO 17665' },
              { value: 'aseptic', label: 'Aseptic Processing — ISO 13408' },
              { value: 'not_sterile', label: 'Device is not supplied sterile' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'sterilization_validation_completed',
            label: 'Sterilization Validation Completed',
            type: 'yes_no',
            visibleWhen: { field: 'sterilization_method', operator: 'neq', value: 'not_sterile' },
            helpText: 'Per 21 CFR 820.75 and the applicable ISO standard, sterilization process validation must demonstrate a Sterility Assurance Level (SAL) of 10^-6.',
          },
          {
            id: 'process_validation_summary',
            label: 'Process Validation Summary',
            type: 'textarea',
            visibleWhen: { field: 'sterilization_method', operator: 'neq', value: 'not_sterile' },
            placeholder: 'e.g., EtO sterilization validated per ISO 11135 with three consecutive half-cycle validation runs. SAL of 10^-6 demonstrated. Bioburden testing per ISO 11737-1.',
          },
          {
            id: 'environmental_controls',
            label: 'Environmental Controls',
            type: 'textarea',
            placeholder: 'e.g., ISO Class 7 cleanroom for assembly per ISO 14644-1. Continuous environmental monitoring for particles and viable organisms. Annual requalification performed.',
            helpText: 'Per 21 CFR 820.70(c), environmental conditions must be adequately controlled to prevent device contamination.',
          },
        ],
        issueChecks: [
          {
            id: 'no_sterilization_validation',
            condition: { field: 'sterilization_validation_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Sterilization Validation Not Completed',
            message:
              'Sterilization process validation per 21 CFR 820.75 is required for devices supplied sterile. The validation must demonstrate a Sterility Assurance Level (SAL) of 10^-6 per the applicable ISO standard (ISO 11135, ISO 11137, or ISO 17665).',
            reference: '21 CFR 820.75; ISO 11135; ISO 11137; ISO 17665',
          },
        ],
        defaultNext: 'bench_testing',
      },

      /* ================================================================ */
      /*  Section 3 — Preclinical Testing                                  */
      /* ================================================================ */

      {
        id: 'bench_testing',
        section: 'Preclinical Testing',
        question:
          'Describe the bench testing program, including mechanical testing, durability, shelf life, and any animal studies conducted.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(v), the PMA must include a summary of all nonclinical laboratory studies and their results. Bench testing should address device performance, mechanical integrity, durability (fatigue testing per ASTM F2477 for cardiovascular devices or equivalent), and shelf life stability per FDA Guidance "Shelf Life of Medical Devices" (1991). Animal studies, when conducted, should follow FDA Guidance "General Considerations for Animal Studies Intended to Evaluate Medical Devices" (2023) and applicable ASTM/ISO standards.',
        fields: [
          {
            id: 'bench_test_summary',
            label: 'Bench Test Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Performance testing included hydrodynamic assessment (pulsatile flow loop), structural integrity (radial force, crush resistance), and deployment testing across 42 device sizes...',
            validation: { minLength: 50 },
          },
          {
            id: 'mechanical_testing',
            label: 'Mechanical Testing Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Tensile testing, compression, radial force measurement, suture retention strength per applicable ASTM/ISO standards.',
          },
          {
            id: 'durability_fatigue_testing',
            label: 'Durability / Fatigue Testing',
            type: 'textarea',
            placeholder: 'e.g., Accelerated fatigue testing to 600 million cycles (equivalent to 15 years) per ASTM F2477. No frame fractures observed. Valve hemodynamic function maintained within acceptance criteria.',
            helpText: 'Per FDA, durability testing should simulate the expected service life of the device under worst-case physiological conditions.',
          },
          {
            id: 'shelf_life_testing',
            label: 'Shelf Life / Package Integrity Testing',
            type: 'textarea',
            placeholder: 'e.g., Real-time shelf life study at 25°C/60% RH through 36 months. Accelerated aging per ASTM F1980. Package integrity per ASTM F2095 and ASTM F1585.',
            helpText: 'Per FDA Guidance "Shelf Life of Medical Devices" (1991) and ISO 11607-1, shelf life must be validated through real-time or accelerated aging studies.',
          },
          {
            id: 'animal_studies_conducted',
            label: 'Were animal studies conducted?',
            type: 'yes_no',
          },
          {
            id: 'animal_study_summary',
            label: 'Animal Study Summary',
            type: 'textarea',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            placeholder: 'e.g., Chronic ovine implant study (n=20, 180-day follow-up). Hemodynamic performance, device migration, endothelialization, and histopathology assessed per GLP (21 CFR Part 58).',
            helpText: 'Per FDA Guidance "General Considerations for Animal Studies Intended to Evaluate Medical Devices" (2023), animal studies should follow GLP where feasible.',
          },
        ],
        defaultNext: 'biocompatibility_eval',
      },

      {
        id: 'biocompatibility_eval',
        section: 'Preclinical Testing',
        question:
          'Describe the biocompatibility evaluation per ISO 10993 for this device.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(v) and FDA Guidance "Use of International Standard ISO 10993-1: Biological Evaluation of Medical Devices — Part 1: Evaluation and Testing within a Risk Management Process" (2023), a comprehensive biological evaluation must be performed. The evaluation framework per ISO 10993-1:2018 considers the nature (contact type), degree (contact duration), and conditions of patient contact. For Class III implantable devices, the full biocompatibility test battery is typically required including cytotoxicity, sensitization, irritation, systemic toxicity, genotoxicity, implantation, and hemocompatibility (ISO 10993-4 for blood-contacting devices).',
        fields: [
          {
            id: 'iso_10993_evaluation_completed',
            label: 'ISO 10993 Full Biological Evaluation Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 10993-1:2018 and FDA Guidance (2023), a biological evaluation plan and report are required. The evaluation should be risk-based and consider all patient-contacting materials.',
          },
          {
            id: 'contact_type',
            label: 'Contact Type (per ISO 10993-1)',
            type: 'select',
            required: true,
            options: [
              { value: 'surface_skin', label: 'Surface — Skin contact' },
              { value: 'surface_mucosal', label: 'Surface — Mucosal membrane' },
              { value: 'surface_breached', label: 'Surface — Breached or compromised surface' },
              { value: 'external_communicating_blood_indirect', label: 'External communicating — Blood path, indirect' },
              { value: 'external_communicating_tissue_bone', label: 'External communicating — Tissue/bone/dentin' },
              { value: 'external_communicating_circulating_blood', label: 'External communicating — Circulating blood' },
              { value: 'implant_tissue_bone', label: 'Implant — Tissue/bone' },
              { value: 'implant_blood', label: 'Implant — Blood contact' },
            ],
          },
          {
            id: 'contact_duration',
            label: 'Contact Duration',
            type: 'select',
            required: true,
            options: [
              { value: 'limited', label: 'Limited (< 24 hours)' },
              { value: 'prolonged', label: 'Prolonged (24 hours – 30 days)' },
              { value: 'permanent', label: 'Permanent (> 30 days)' },
            ],
          },
          {
            id: 'biocompatibility_tests_completed',
            label: 'Biocompatibility Tests Completed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'cytotoxicity', label: 'Cytotoxicity (ISO 10993-5)' },
              { value: 'sensitization', label: 'Sensitization (ISO 10993-10)' },
              { value: 'irritation', label: 'Irritation (ISO 10993-10)' },
              { value: 'systemic_toxicity', label: 'Systemic Toxicity — Acute (ISO 10993-11)' },
              { value: 'subchronic_toxicity', label: 'Systemic Toxicity — Subchronic (ISO 10993-11)' },
              { value: 'genotoxicity', label: 'Genotoxicity (ISO 10993-3)' },
              { value: 'implantation', label: 'Implantation (ISO 10993-6)' },
              { value: 'hemocompatibility', label: 'Hemocompatibility (ISO 10993-4)' },
              { value: 'chronic_toxicity', label: 'Chronic Toxicity (ISO 10993-11)' },
              { value: 'carcinogenicity', label: 'Carcinogenicity (ISO 10993-3)' },
              { value: 'reproductive_developmental', label: 'Reproductive/Developmental Toxicity (ISO 10993-11)' },
              { value: 'degradation', label: 'Degradation (ISO 10993-9/13/14/15)' },
            ],
          },
          {
            id: 'biological_risk_assessment',
            label: 'Biological Risk Assessment Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Risk-based biological evaluation per ISO 10993-1 framework completed. All materials evaluated for chemical characterization per ISO 10993-18. Toxicological risk assessment per ISO 10993-17 performed for extractable/leachable compounds.',
            validation: { minLength: 50 },
          },
        ],
        issueChecks: [
          {
            id: 'no_biocompatibility_evaluation',
            condition: { field: 'iso_10993_evaluation_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Biocompatibility Evaluation Not Completed',
            message:
              'A comprehensive biological evaluation per ISO 10993-1:2018 is required for all Class III devices. Without this evaluation, the PMA cannot establish device safety. The evaluation must be risk-based and address all patient-contacting materials.',
            reference: 'ISO 10993-1:2018; FDA Guidance: Use of ISO 10993-1 (2023); 21 CFR 814.20(b)(3)(v)',
          },
        ],
        defaultNext: 'sw_electrical_emc',
        provideExpertFeedback: true,
      },

      {
        id: 'sw_electrical_emc',
        section: 'Preclinical Testing',
        question:
          'If the device contains software or electrical components, describe the software safety classification, documentation, and electromagnetic compatibility testing.',
        guidance:
          'Per FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023) and IEC 62304:2006/AMD1:2015, software in Class III devices must be classified (Class A, B, or C) based on the severity of hazard from software failure. Software documentation must include software requirements specification, architecture design, detailed design, unit testing, integration testing, and system testing. IEC 60601-1:2005+A1+A2 (Medical Electrical Equipment — General Requirements for Basic Safety and Essential Performance) and IEC 60601-1-2:2014+A1:2020 (EMC) testing are required for electrically powered medical devices.',
        fields: [
          {
            id: 'device_has_software',
            label: 'Does this device include software?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'iec_62304_class',
            label: 'IEC 62304 Software Safety Classification',
            type: 'select',
            visibleWhen: { field: 'device_has_software', operator: 'eq', value: true },
            options: [
              { value: 'class_a', label: 'Class A — No injury or damage to health possible' },
              { value: 'class_b', label: 'Class B — Non-serious injury possible' },
              { value: 'class_c', label: 'Class C — Death or serious injury possible' },
              { value: 'none', label: 'Not yet classified' },
            ],
            helpText: 'Per IEC 62304:2006/AMD1:2015, the software safety class determines the rigor of the software development lifecycle process.',
          },
          {
            id: 'software_documentation_status',
            label: 'Software Documentation Status',
            type: 'multi_select',
            visibleWhen: { field: 'device_has_software', operator: 'eq', value: true },
            options: [
              { value: 'srs', label: 'Software Requirements Specification (SRS)' },
              { value: 'architecture', label: 'Software Architecture Design' },
              { value: 'detailed_design', label: 'Detailed Software Design' },
              { value: 'unit_testing', label: 'Unit Testing Reports' },
              { value: 'integration_testing', label: 'Integration Testing Reports' },
              { value: 'system_testing', label: 'System Testing Reports' },
              { value: 'traceability', label: 'Requirements Traceability Matrix' },
              { value: 'cybersecurity', label: 'Cybersecurity Documentation per FDA Guidance (2023)' },
            ],
            helpText: 'Per FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023), all documentation items are expected for Class III device software.',
          },
          {
            id: 'iec_60601_testing_completed',
            label: 'IEC 60601-1 Testing Completed (Electrical Safety)',
            type: 'yes_no',
            helpText: 'Per IEC 60601-1:2005+A1+A2, testing covers electrical safety including protection against electric shock, mechanical hazards, unwanted radiation, and temperature limits.',
          },
          {
            id: 'emc_testing_completed',
            label: 'EMC Testing Completed (IEC 60601-1-2)',
            type: 'yes_no',
            helpText: 'Per IEC 60601-1-2:2014+A1:2020, electromagnetic compatibility testing includes emissions and immunity testing. FDA requires compliance for all electrically powered medical devices.',
          },
        ],
        issueChecks: [
          {
            id: 'software_without_iec_62304',
            condition: { field: 'iec_62304_class', operator: 'eq', value: 'none' },
            severity: 'critical',
            title: 'Software Not Classified per IEC 62304',
            message:
              'Software in a Class III device must be classified per IEC 62304:2006/AMD1:2015. The software safety class determines the required rigor of development lifecycle documentation. FDA expects complete software documentation per the "Content of Premarket Submissions for Device Software Functions" guidance (2023).',
            reference: 'IEC 62304:2006/AMD1:2015; FDA Guidance: Content of Premarket Submissions for Device Software Functions (2023)',
          },
          {
            id: 'no_emc_testing',
            condition: { field: 'emc_testing_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'EMC Testing Not Completed',
            message:
              'Electromagnetic compatibility testing per IEC 60601-1-2:2014+A1:2020 is required for all electrically powered medical devices. The PMA must include evidence of EMC compliance including emissions and immunity test results.',
            reference: 'IEC 60601-1-2:2014+A1:2020; 21 CFR 814.20(b)(3)(v)',
          },
        ],
        defaultNext: 'clinical_study_design',
      },

      /* ================================================================ */
      /*  Section 4 — Clinical Evidence                                    */
      /* ================================================================ */

      {
        id: 'clinical_study_design',
        section: 'Clinical Evidence',
        question:
          'Describe the clinical study supporting this PMA. Was an IDE study conducted, and what was the study design?',
        guidance:
          'Per 21 CFR 814.20(b)(3)(vi) and 21 CFR 814.20(b)(6), the PMA must include clinical investigations involving human subjects, including the IDE study results. An Investigational Device Exemption (IDE) per 21 CFR 812 is required for significant-risk Class III device studies. The study design should follow FDA Guidance "Design Considerations for Pivotal Clinical Investigations for Medical Devices" (2013) and ICH E9 "Statistical Principles for Clinical Trials." The primary endpoint, sample size, follow-up duration, and control strategy must be clearly described.',
        fields: [
          {
            id: 'ide_study_conducted',
            label: 'IDE Study Conducted',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 812, a significant-risk device study requires an approved IDE before enrollment. The IDE number must be provided.',
          },
          {
            id: 'ide_number',
            label: 'IDE Number',
            type: 'text',
            placeholder: 'e.g., G120345',
            visibleWhen: { field: 'ide_study_conducted', operator: 'eq', value: true },
          },
          {
            id: 'study_design',
            label: 'Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial (RCT)' },
              { value: 'single_arm', label: 'Single-Arm Study with Objective Performance Criteria' },
              { value: 'non_randomized_concurrent', label: 'Non-Randomized with Concurrent Control' },
              { value: 'non_randomized_historical', label: 'Non-Randomized with Historical Control' },
              { value: 'registry_based', label: 'Registry-Based Study' },
              { value: 'adaptive', label: 'Adaptive Design' },
              { value: 'bayesian', label: 'Bayesian Design' },
            ],
          },
          {
            id: 'control_type',
            label: 'Control Type',
            type: 'select',
            options: [
              { value: 'active_comparator', label: 'Active Comparator (standard of care device/treatment)' },
              { value: 'sham', label: 'Sham Control' },
              { value: 'historical', label: 'Historical Control / OPC' },
              { value: 'none', label: 'No Control (single-arm)' },
            ],
            helpText: 'Per FDA Guidance "Design Considerations for Pivotal Clinical Investigations" (2013), the choice of control must be scientifically justified.',
          },
          {
            id: 'number_of_sites',
            label: 'Number of Investigational Sites',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'number_of_subjects_enrolled',
            label: 'Number of Subjects Enrolled',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'primary_endpoint_description',
            label: 'Primary Endpoint Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Composite of all-cause mortality and disabling stroke at 12 months, compared to a pre-specified objective performance criterion (OPC) of 25%.',
            validation: { minLength: 30 },
          },
          {
            id: 'follow_up_duration_months',
            label: 'Follow-Up Duration (months)',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'FDA typically requires minimum 12-month follow-up for implantable devices, with longer follow-up for permanent implants.',
          },
        ],
        issueChecks: [
          {
            id: 'no_ide_study',
            condition: { field: 'ide_study_conducted', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No IDE Study Conducted',
            message:
              'A PMA application for a Class III device typically requires clinical data from an IDE study (21 CFR 812). Without clinical evidence from a controlled study, the PMA cannot demonstrate reasonable assurance of safety and effectiveness per 21 CFR 814.20(b)(3)(vi).',
            reference: '21 CFR 812; 21 CFR 814.20(b)(3)(vi)',
          },
          {
            id: 'insufficient_follow_up',
            condition: { field: 'follow_up_duration_months', operator: 'lt', value: 12 },
            severity: 'warning',
            title: 'Follow-Up Duration May Be Insufficient',
            message:
              'FDA typically expects a minimum of 12 months of follow-up data for implantable Class III devices. For permanent implants, 24 months or longer may be required. Shorter follow-up may not capture delayed adverse events or long-term performance degradation.',
            reference: 'FDA Guidance: Design Considerations for Pivotal Clinical Investigations (2013)',
          },
        ],
        defaultNext: 'clinical_results',
        provideExpertFeedback: true,
      },

      {
        id: 'clinical_results',
        section: 'Clinical Evidence',
        question:
          'Summarize the clinical results, including whether the primary endpoint was met and the statistical significance of findings.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(vi)(A), the PMA must include a description and analysis of all clinical investigations, including both favorable and unfavorable results. The primary endpoint analysis should be presented with appropriate statistical methods, confidence intervals, and p-values per ICH E9 "Statistical Principles for Clinical Trials." Both per-protocol and intent-to-treat (ITT) analyses should be reported. FDA expects transparency in reporting, including the handling of missing data, protocol deviations, and sensitivity analyses.',
        fields: [
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'efficacy_results_summary',
            label: 'Efficacy Results Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Primary composite endpoint (all-cause mortality + disabling stroke) at 12 months: 8.5% (95% CI: 5.2-11.8%) vs. OPC of 25% (p<0.001). All prespecified secondary endpoints met.',
            validation: { minLength: 50 },
          },
          {
            id: 'statistical_significance',
            label: 'Statistical Significance',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Primary endpoint: p<0.001 (one-sided test, alpha=0.025). 95% upper confidence bound: 11.8%, well below OPC of 25%.',
          },
          {
            id: 'analysis_population',
            label: 'Analysis Population',
            type: 'select',
            required: true,
            options: [
              { value: 'itt', label: 'Intent-to-Treat (ITT) — primary analysis' },
              { value: 'per_protocol', label: 'Per-Protocol — primary analysis' },
              { value: 'both', label: 'Both ITT and Per-Protocol reported' },
              { value: 'modified_itt', label: 'Modified ITT (mITT) — primary analysis' },
            ],
            helpText: 'Per ICH E9, the ITT population is generally preferred as the primary analysis population. Both ITT and per-protocol results should be reported.',
          },
        ],
        issueChecks: [
          {
            id: 'primary_endpoint_not_met',
            condition: { field: 'primary_endpoint_met', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Primary Endpoint Not Met',
            message:
              'Failure to meet the primary endpoint significantly weakens the evidentiary basis for PMA approval. FDA may require additional studies or expanded analyses to support the application. Consider whether secondary endpoints, subgroup analyses, or a modified indication could support the benefit-risk determination.',
            reference: '21 CFR 814.20(b)(3)(vi); ICH E9',
          },
        ],
        defaultNext: 'clinical_safety',
      },

      {
        id: 'clinical_safety',
        section: 'Clinical Evidence',
        question:
          'Provide the clinical safety data, including adverse events, device-related events, and any unanticipated adverse device effects.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(vi)(B), the PMA must include a summary of safety information, including adverse events, complications, device failures, and deaths. Device-related adverse events must be distinguished from procedure-related and unrelated events. Unanticipated adverse device effects (UADEs) per 21 CFR 812.150(b)(1) require reporting to FDA, IRBs, and all investigators within 10 working days. Serious adverse events per 21 CFR 812.150(a)(1) must be reported within 10 days. Present adverse events using standardized coding (e.g., MedDRA).',
        fields: [
          {
            id: 'total_adverse_events',
            label: 'Total Number of Adverse Events',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'device_related_adverse_events',
            label: 'Device-Related Adverse Events',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'serious_adverse_events',
            label: 'Serious Adverse Events (SAEs)',
            type: 'number',
            required: true,
            validation: { min: 0 },
            helpText: 'Per 21 CFR 812.150(a)(1), SAEs include death, life-threatening events, hospitalization, disability, or congenital anomaly.',
          },
          {
            id: 'unanticipated_adverse_device_effects',
            label: 'Unanticipated Adverse Device Effects (UADEs)',
            type: 'number',
            required: true,
            validation: { min: 0 },
            helpText: 'Per 21 CFR 812.150(b)(1), UADEs are adverse effects not previously identified in nature, severity, or degree of incidence.',
          },
          {
            id: 'safety_narrative_summary',
            label: 'Safety Narrative Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Most common adverse events were access-site vascular complications (12%), conduction disturbances requiring pacemaker implantation (8%), and paravalvular leak (5%). No device migration, embolization, or structural valve deterioration observed through 12-month follow-up.',
            validation: { minLength: 50 },
          },
        ],
        defaultNext: 'sample_size_stats',
      },

      /* ================================================================ */
      /*  Section 5 — Statistical Analysis                                 */
      /* ================================================================ */

      {
        id: 'sample_size_stats',
        section: 'Statistical Analysis',
        question:
          'Describe the sample size justification and statistical power for the clinical study.',
        guidance:
          'Per ICH E9 "Statistical Principles for Clinical Trials" and FDA Guidance "Design Considerations for Pivotal Clinical Investigations for Medical Devices" (2013), the sample size must be justified based on the primary endpoint, expected effect size, desired power, and significance level. The calculation should account for expected dropout rates. For device studies, FDA often requires >=80% power at alpha=0.05 (two-sided) or alpha=0.025 (one-sided for non-inferiority/superiority). The assumed effect size should be clinically meaningful and based on available data (pilot studies, literature).',
        fields: [
          {
            id: 'sample_size_justification',
            label: 'Sample Size Justification',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Based on a one-sample exact binomial test comparing the primary endpoint rate to the OPC of 25%, 325 subjects provide 90% power to detect a true event rate of 15% at a one-sided alpha of 0.025.',
            validation: { minLength: 50 },
          },
          {
            id: 'power_calculation',
            label: 'Statistical Power',
            type: 'number',
            required: true,
            placeholder: 'e.g., 90',
            validation: { min: 50, max: 100 },
            helpText: 'Enter as a percentage (e.g., 80 or 90). FDA typically requires >=80% power.',
          },
          {
            id: 'alpha_level',
            label: 'Alpha (Significance) Level',
            type: 'select',
            required: true,
            options: [
              { value: '0.05', label: '0.05 (two-sided)' },
              { value: '0.025', label: '0.025 (one-sided)' },
              { value: '0.01', label: '0.01 (two-sided)' },
              { value: 'other', label: 'Other — specify in justification' },
            ],
          },
          {
            id: 'assumed_effect_size',
            label: 'Assumed Effect Size',
            type: 'text',
            required: true,
            placeholder: 'e.g., Expected event rate of 15% vs. OPC of 25% (absolute difference: 10%)',
            helpText: 'The clinically meaningful difference the study is powered to detect.',
          },
          {
            id: 'dropout_rate_assumption',
            label: 'Dropout / Lost-to-Follow-Up Rate Assumption',
            type: 'number',
            placeholder: 'e.g., 10',
            helpText: 'Enter as a percentage. The sample size should account for expected attrition.',
            validation: { min: 0, max: 100 },
          },
        ],
        defaultNext: 'analysis_methods',
      },

      {
        id: 'analysis_methods',
        section: 'Statistical Analysis',
        question:
          'Describe the statistical analysis methods, including handling of missing data and sensitivity analyses.',
        guidance:
          'Per ICH E9 "Statistical Principles for Clinical Trials" and FDA Guidance "Statistical Guidance on Reporting Results from Studies Evaluating Diagnostic Tests" (for diagnostic devices), the statistical analysis plan (SAP) must prespecify the primary analysis method, handling of missing data (per ICH E9(R1) estimand framework), and sensitivity analyses. For Bayesian methods, refer to FDA Guidance "Guidance for the Use of Bayesian Statistics in Medical Device Clinical Trials" (2010). Multiple comparison adjustments per ICH E9 should be described if multiple primary endpoints or interim analyses are planned.',
        fields: [
          {
            id: 'primary_analysis_method',
            label: 'Primary Analysis Method',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., One-sample exact binomial test comparing the Kaplan-Meier estimate of the primary composite endpoint at 12 months against the OPC. 95% upper confidence bound using Clopper-Pearson method.',
          },
          {
            id: 'missing_data_handling',
            label: 'Missing Data Handling Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'complete_case', label: 'Complete Case Analysis' },
              { value: 'multiple_imputation', label: 'Multiple Imputation' },
              { value: 'worst_case', label: 'Worst-Case Imputation' },
              { value: 'mixed_models', label: 'Mixed Models for Repeated Measures (MMRM)' },
              { value: 'estimand', label: 'Estimand-Based Framework (ICH E9(R1))' },
              { value: 'other', label: 'Other — described in SAP' },
            ],
            helpText: 'Per ICH E9(R1), the estimand framework should guide the approach to intercurrent events and missing data. The primary analysis should be robust to missingness assumptions.',
          },
          {
            id: 'sensitivity_analyses_conducted',
            label: 'Sensitivity Analyses Conducted',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., 1) Worst-case imputation for missing data, 2) Per-protocol analysis excluding major protocol deviations, 3) Tipping-point analysis, 4) Subgroup analyses by age, sex, and baseline risk.',
          },
          {
            id: 'bayesian_methods_used',
            label: 'Bayesian Methods Used',
            type: 'yes_no',
            helpText: 'Per FDA Guidance "Guidance for the Use of Bayesian Statistics in Medical Device Clinical Trials" (2010), Bayesian methods may be used for device trials with appropriate justification of prior information.',
          },
          {
            id: 'bayesian_details',
            label: 'Bayesian Methods Details',
            type: 'textarea',
            visibleWhen: { field: 'bayesian_methods_used', operator: 'eq', value: true },
            placeholder: 'e.g., Informative prior derived from OUS registry data (n=500). Prior effective sample size = 50. Beta-binomial model with posterior probability of success >=0.975 as decision criterion.',
            helpText: 'Per FDA Guidance (2010), describe the prior distribution, its source, sensitivity to prior specification, and the decision criteria.',
          },
        ],
        defaultNext: 'proposed_labeling',
      },

      /* ================================================================ */
      /*  Section 6 — Labeling                                             */
      /* ================================================================ */

      {
        id: 'proposed_labeling',
        section: 'Labeling',
        question:
          'Describe the proposed device labeling, including instructions for use, warnings, and MR compatibility.',
        guidance:
          'Per 21 CFR 814.20(b)(7) and 21 CFR 801, the PMA must include proposed labeling for the device, including the package label, instructions for use (IFU), and any patient-directed labeling. Labeling must contain adequate directions for use per 21 CFR 801.5, warnings per 21 CFR 801.109, and contraindications. For MR conditional devices, labeling must comply with ASTM F2503 and include MR safety conditions per FDA Guidance "Assessment of Radiofrequency-Induced Heating in the Magnetic Resonance (MR) Environment for Multi-Configuration Passive Medical Devices" (2021).',
        fields: [
          {
            id: 'ifu_drafted',
            label: 'Instructions for Use (IFU) Drafted',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 801.5, adequate directions for use must be included. IFU should cover device preparation, implantation/use procedure, troubleshooting, and post-procedure care.',
          },
          {
            id: 'physician_labeling_summary',
            label: 'Physician Labeling Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Physician labeling includes device description, indications, contraindications, warnings and precautions, patient selection criteria, implant procedure, troubleshooting, adverse events, clinical study summary, and how supplied.',
          },
          {
            id: 'warnings_precautions',
            label: 'Warnings and Precautions',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., WARNING: Device should only be implanted by physicians trained in the procedure. PRECAUTION: Anticoagulation therapy required per institutional protocol. WARNING: Do not use if packaging is opened or damaged.',
            helpText: 'Per 21 CFR 801.109, warnings must be prominent and adequate to protect users and patients.',
          },
          {
            id: 'contraindications',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Active endocarditis, known sensitivity to nitinol or bovine tissue, inadequate annulus size (<18mm or >29mm), pre-existing prosthetic valve in the target position.',
          },
          {
            id: 'mr_conditional',
            label: 'Is the device MR Conditional?',
            type: 'yes_no',
            helpText: 'Per ASTM F2503 and FDA Guidance, MR conditional devices require specific conditions for safe use in the MR environment.',
          },
          {
            id: 'mr_labeling_details',
            label: 'MR Safety Labeling Details',
            type: 'textarea',
            visibleWhen: { field: 'mr_conditional', operator: 'eq', value: true },
            placeholder: 'e.g., MR Conditional: Safe under specified conditions. Static field: 1.5T and 3T only. Spatial gradient: <=40 T/m. RF conditions: SAR <=2 W/kg whole body. Scan duration <=30 min.',
            helpText: 'Per ASTM F2503 and FDA Guidance, MR conditions must be clearly stated including field strength, spatial gradient, RF conditions, and scan duration limits.',
          },
        ],
        issueChecks: [
          {
            id: 'no_ifu',
            condition: { field: 'ifu_drafted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Instructions for Use Not Drafted',
            message:
              'Per 21 CFR 801.5 and 21 CFR 814.20(b)(7), the PMA must include proposed labeling with adequate directions for use. The IFU is a critical component of the PMA submission and must be finalized before submission.',
            reference: '21 CFR 801.5; 21 CFR 814.20(b)(7)',
          },
        ],
        defaultNext: 'patient_labeling',
      },

      {
        id: 'patient_labeling',
        section: 'Labeling',
        question:
          'Is patient-directed labeling required for this device? Describe the patient labeling, training requirements, and implant card needs.',
        guidance:
          'Per 21 CFR 801.109 and FDA Guidance "Patient Labeling" (2001), patient-directed labeling may be required for implantable or life-sustaining devices. The labeling should be written at an appropriate reading level and include device description, benefits and risks, follow-up care requirements, and emergency contact information. Per 21 CFR 821, certain devices require tracking, including an implant card per FDA Unique Device Identification (UDI) requirements (21 CFR 830). Training requirements for physicians and clinical staff should be described per 21 CFR 814.20(b)(7).',
        fields: [
          {
            id: 'patient_labeling_required',
            label: 'Patient Labeling Required',
            type: 'yes_no',
            required: true,
            helpText: 'Patient labeling is typically required for implantable, life-supporting, or life-sustaining devices per FDA guidance.',
          },
          {
            id: 'patient_labeling_summary',
            label: 'Patient Labeling Summary',
            type: 'textarea',
            visibleWhen: { field: 'patient_labeling_required', operator: 'eq', value: true },
            placeholder: 'e.g., Patient guide includes plain-language description of the device, benefits and risks, what to expect during the procedure, post-procedure care, signs and symptoms to report, and MR safety information.',
            helpText: 'Per FDA Guidance "Patient Labeling" (2001), patient materials should be written at or below an 8th grade reading level.',
          },
          {
            id: 'training_requirements',
            label: 'Physician/Staff Training Requirements',
            type: 'textarea',
            placeholder: 'e.g., Physicians must complete a proctored training program including didactic session, simulation lab, and 3 proctored cases before independent use. Annual recertification required.',
            helpText: 'Per 21 CFR 814.20(b)(7), describe training programs for safe and effective use of the device.',
          },
          {
            id: 'implant_card_needed',
            label: 'Implant Card Needed',
            type: 'yes_no',
            helpText: 'Per 21 CFR 821 (Device Tracking) and the UDI Rule (21 CFR 830), certain implantable devices require patient implant cards with device identification information.',
          },
        ],
        defaultNext: 'risk_management_pma',
      },

      /* ================================================================ */
      /*  Section 7 — Risk Analysis                                        */
      /* ================================================================ */

      {
        id: 'risk_management_pma',
        section: 'Risk Analysis',
        question:
          'Describe the risk management process and documentation for this device.',
        guidance:
          'Per ISO 14971:2019 "Medical Devices — Application of Risk Management to Medical Devices" and 21 CFR 820.30(g), a comprehensive risk management process must be implemented throughout the device lifecycle. The risk management file must include the risk management plan, risk analysis (including FMEA per IEC 60812, FTA per IEC 61025), risk evaluation, risk control measures, and residual risk assessment. FDA Guidance "Factors to Consider Regarding Benefit-Risk in Medical Device Product Availability, Compliance, and Enforcement Decisions" (2016) provides the framework for the overall benefit-risk determination.',
        fields: [
          {
            id: 'iso_14971_plan',
            label: 'ISO 14971 Risk Management Plan',
            type: 'select',
            required: true,
            options: [
              { value: 'complete', label: 'Complete — risk management plan per ISO 14971:2019' },
              { value: 'in_progress', label: 'In progress — plan under development' },
              { value: 'not_started', label: 'Not started' },
            ],
          },
          {
            id: 'risk_management_file_complete',
            label: 'Risk Management File Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 Clause 4.5, the risk management file must contain all risk management activities including plan, analysis, evaluation, controls, and residual risk assessment.',
          },
          {
            id: 'fmea_completed',
            label: 'FMEA (Failure Mode and Effects Analysis) Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per IEC 60812, FMEA is a systematic technique for analyzing potential failure modes, their causes, and effects on device performance and patient safety.',
          },
          {
            id: 'fta_completed',
            label: 'FTA (Fault Tree Analysis) Completed',
            type: 'yes_no',
            helpText: 'Per IEC 61025, FTA provides a top-down analysis of system failures, complementing the bottom-up FMEA approach.',
          },
          {
            id: 'hazard_analysis_method',
            label: 'Hazard Analysis Method',
            type: 'multi_select',
            options: [
              { value: 'fmea', label: 'FMEA (IEC 60812)' },
              { value: 'fta', label: 'FTA (IEC 61025)' },
              { value: 'hazop', label: 'HAZOP' },
              { value: 'pha', label: 'Preliminary Hazard Analysis (PHA)' },
              { value: 'use_fmea', label: 'Use-Related FMEA (uFMEA)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'number_of_identified_risks',
            label: 'Number of Identified Risks',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Total number of risks identified through the hazard analysis process.',
          },
        ],
        issueChecks: [
          {
            id: 'no_risk_management_file',
            condition: { field: 'risk_management_file_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Risk Management File Not Complete',
            message:
              'A complete risk management file per ISO 14971:2019 is mandatory for PMA approval. The file must document the entire risk management process, including risk analysis, evaluation, controls, and residual risk assessment. FDA will review the risk management file during the PMA review.',
            reference: 'ISO 14971:2019; 21 CFR 820.30(g)',
          },
          {
            id: 'no_fmea',
            condition: { field: 'fmea_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'FMEA Not Completed',
            message:
              'Failure Mode and Effects Analysis (FMEA) per IEC 60812 is a standard risk analysis technique expected for Class III devices. FMEA should cover design, process, and use-related failure modes. FDA reviewers expect to see a comprehensive FMEA in the risk management file.',
            reference: 'IEC 60812; ISO 14971:2019 Clause 5',
          },
        ],
        defaultNext: 'risk_benefit',
      },

      {
        id: 'risk_benefit',
        section: 'Risk Analysis',
        question:
          'Describe the benefit-risk determination for this device, including comparison to alternative treatments and residual risk acceptability.',
        guidance:
          'Per 21 CFR 814.44(d) and FDA Guidance "Factors to Consider Regarding Benefit-Risk in Medical Device Product Availability, Compliance, and Enforcement Decisions" (2016), FDA evaluates five factors in the benefit-risk assessment: (1) the probable benefit to health from the device, (2) the probable risk of illness or injury from the device, (3) the probable benefit to health from alternative treatments, (4) the probable risk of alternative treatments, and (5) other relevant factors. The determination must demonstrate that the probable benefits outweigh the probable risks when used as intended. Unmitigated risks must be clearly described and justified.',
        fields: [
          {
            id: 'risk_benefit_summary',
            label: 'Risk-Benefit Determination Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The device provides a less invasive treatment option for high-risk patients who are not candidates for open-heart surgery. Clinical data demonstrate a 12-month mortality rate of 8.5% compared to 30% mortality with medical management alone. The risk-benefit profile is favorable considering the severity of the condition and lack of therapeutic alternatives.',
            validation: { minLength: 100 },
          },
          {
            id: 'comparison_to_alternatives',
            label: 'Comparison to Alternative Treatments',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Alternative treatments include: (1) surgical valve replacement — 30-day mortality 4-8% in standard-risk patients but >15% in high-risk; (2) medical management — 1-year mortality 30-50% in severe aortic stenosis; (3) balloon valvuloplasty — palliative only, high restenosis rate.',
          },
          {
            id: 'unmitigated_risks',
            label: 'Unmitigated Risks Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Residual risks include: conduction disturbances requiring permanent pacemaker (~8%), paravalvular leak (moderate or greater ~3%), vascular access complications (~5%). These risks are mitigable through patient selection, operator training, and post-procedure monitoring.',
          },
          {
            id: 'residual_risk_acceptable',
            label: 'Overall Residual Risk Acceptable',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 Clause 7 and 21 CFR 814.44(d), the overall residual risk must be evaluated against the benefits of the device.',
          },
        ],
        issueChecks: [
          {
            id: 'residual_risk_not_acceptable',
            condition: { field: 'residual_risk_acceptable', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Residual Risk Not Acceptable',
            message:
              'If the overall residual risk is not acceptable per ISO 14971:2019, additional risk control measures must be implemented before proceeding with the PMA submission. FDA will evaluate whether the probable benefits outweigh the probable risks per 21 CFR 814.44(d). Consider additional design changes, labeling mitigations, or post-market conditions.',
            reference: 'ISO 14971:2019 Clause 7; 21 CFR 814.44(d)',
          },
        ],
        defaultNext: 'post_approval_study',
        provideExpertFeedback: true,
      },

      /* ================================================================ */
      /*  Section 8 — Post-Market                                          */
      /* ================================================================ */

      {
        id: 'post_approval_study',
        section: 'Post-Market',
        question:
          'Has a post-approval study (PAS) plan been developed? Describe the PAS design, enrollment, and endpoints.',
        guidance:
          'Per 21 CFR 814.82 and FDA Guidance "Post-Approval Studies" (2016), FDA may require post-approval studies as a condition of PMA approval to obtain additional safety and effectiveness data in a broader patient population or over longer follow-up. The PAS plan should be discussed with FDA during the pre-submission process. Common PAS designs include prospective single-arm registries, randomized controlled trials with extended follow-up, or real-world evidence studies. The PAS study should be designed to address specific questions about long-term performance, rare adverse events, or expanded indications.',
        fields: [
          {
            id: 'pas_plan_developed',
            label: 'Post-Approval Study (PAS) Plan Developed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 814.82, FDA may impose PAS requirements as a condition of approval. A proactive PAS proposal demonstrates commitment to long-term safety monitoring.',
          },
          {
            id: 'pas_study_design',
            label: 'PAS Study Design',
            type: 'textarea',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            placeholder: 'e.g., Prospective, multi-center, single-arm registry enrolling consecutively treated patients at up to 50 U.S. sites. Annual follow-up through 5 years.',
          },
          {
            id: 'pas_enrollment_target',
            label: 'PAS Enrollment Target',
            type: 'number',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            validation: { min: 1 },
            placeholder: 'e.g., 2000',
          },
          {
            id: 'pas_endpoints',
            label: 'PAS Endpoints',
            type: 'textarea',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            placeholder: 'e.g., Primary: All-cause mortality at 5 years. Secondary: Structural valve deterioration, rehospitalization for heart failure, permanent pacemaker implantation rate, patient-reported outcomes (KCCQ).',
          },
          {
            id: 'pas_duration',
            label: 'PAS Duration (years)',
            type: 'number',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            validation: { min: 1 },
            placeholder: 'e.g., 10',
            helpText: 'For permanent implants, FDA typically requires 5-10 years of post-market follow-up.',
          },
        ],
        issueChecks: [
          {
            id: 'no_pas_plan',
            condition: { field: 'pas_plan_developed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Post-Approval Study Plan Developed',
            message:
              'FDA commonly requires post-approval studies (PAS) as a condition of PMA approval per 21 CFR 814.82, particularly for novel Class III devices. Developing a PAS plan proactively demonstrates commitment to long-term safety surveillance and may facilitate the approval process.',
            reference: '21 CFR 814.82; FDA Guidance: Post-Approval Studies (2016)',
          },
        ],
        defaultNext: 'post_market_surveillance',
      },

      {
        id: 'post_market_surveillance',
        section: 'Post-Market',
        question:
          'Describe the post-market surveillance plan, including MDR reporting, annual reports, and complaints handling.',
        guidance:
          'Per 21 CFR 822, FDA may require post-market surveillance studies for certain Class III devices. Medical Device Reporting (MDR) per 21 CFR 803 requires manufacturers to report deaths, serious injuries, and malfunctions to FDA. Annual reports per 21 CFR 814.84 must be submitted for all PMA-approved devices, summarizing the distribution, adverse events, design changes, and ongoing studies. The complaints handling process per 21 CFR 820.198 must be established before device distribution. FDA Guidance "Distinguishing Medical Device Recalls from Medical Device Enhancements" (2018) provides guidance on when post-market changes require supplemental submissions.',
        fields: [
          {
            id: 'surveillance_required',
            label: '21 CFR 822 Post-Market Surveillance Required',
            type: 'yes_no',
            helpText: 'Per 21 CFR 822, FDA may order post-market surveillance for Class III devices when the failure of the device would be reasonably likely to have serious adverse health consequences.',
          },
          {
            id: 'mdr_reporting_plan',
            label: 'MDR Reporting Plan (21 CFR 803)',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 803, manufacturers must report device-related deaths within 30 days (or 5 days for reportable events requiring remedial action), serious injuries within 30 days, and malfunctions within 30 days.',
          },
          {
            id: 'annual_report_plan',
            label: 'Annual Report Plan (21 CFR 814.84)',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 814.84, PMA holders must submit annual reports containing a summary of device performance, adverse events, distribution data, and any design or manufacturing changes.',
          },
          {
            id: 'complaints_handling_process',
            label: 'Complaints Handling Process',
            type: 'select',
            required: true,
            options: [
              { value: 'established', label: 'Established and documented per 21 CFR 820.198' },
              { value: 'in_development', label: 'In development' },
              { value: 'not_started', label: 'Not yet started' },
            ],
            helpText: 'Per 21 CFR 820.198, procedures for receiving, reviewing, and evaluating complaints must be established.',
          },
        ],
        issueChecks: [
          {
            id: 'no_mdr_reporting_plan',
            condition: { field: 'mdr_reporting_plan', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No MDR Reporting Plan',
            message:
              'Medical Device Reporting per 21 CFR 803 is a mandatory post-market requirement. Manufacturers must have procedures in place to identify, report, and track device-related deaths, serious injuries, and malfunctions. Failure to report is a violation subject to enforcement action.',
            reference: '21 CFR 803; 21 CFR 814.84',
          },
        ],
        defaultNext: 'pre_submission',
      },

      /* ================================================================ */
      /*  Section 9 — Submission Strategy                                  */
      /* ================================================================ */

      {
        id: 'pre_submission',
        section: 'Submission Strategy',
        question:
          'Have you had any pre-submission interactions with FDA? Describe the Q-Sub meeting and any FDA feedback received.',
        guidance:
          'Per FDA Guidance "Requests for Feedback and Meetings for Medical Device Submissions: The Q-Submission Program" (2023), sponsors may request pre-submission (Q-Sub) meetings to discuss clinical trial design, regulatory pathway, bench testing strategy, and clinical data requirements. Q-Sub meetings are strongly recommended before filing a PMA for a novel Class III device. FDA feedback from Q-Sub meetings should be addressed in the PMA submission. Types of Q-Sub requests include Pre-Submission (Pre-Sub), Study Risk Determination, Informational Meeting, and Agreement/Determination Meeting.',
        fields: [
          {
            id: 'qsub_requested',
            label: 'Q-Sub Meeting Requested',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Q-Submission Guidance (2023), a Pre-Sub meeting is strongly recommended for novel Class III devices to align on study design, testing, and PMA content expectations.',
          },
          {
            id: 'qsub_meeting_date',
            label: 'Q-Sub Meeting Date',
            type: 'date',
            visibleWhen: { field: 'qsub_requested', operator: 'eq', value: true },
          },
          {
            id: 'fda_feedback_summary',
            label: 'FDA Feedback Summary',
            type: 'textarea',
            visibleWhen: { field: 'qsub_requested', operator: 'eq', value: true },
            placeholder: 'e.g., FDA agreed with proposed study design (single-arm with OPC), recommended minimum 12-month primary endpoint follow-up, requested additional fatigue testing to 600M cycles, and suggested MR conditional testing at 1.5T and 3T.',
            validation: { minLength: 30 },
          },
          {
            id: 'pre_submission_agreement',
            label: 'Pre-Submission Agreement Reached',
            type: 'select',
            visibleWhen: { field: 'qsub_requested', operator: 'eq', value: true },
            options: [
              { value: 'full_agreement', label: 'Full agreement on study design and data requirements' },
              { value: 'partial_agreement', label: 'Partial agreement — some open items remain' },
              { value: 'no_agreement', label: 'No agreement reached — significant differences' },
              { value: 'pending', label: 'Meeting pending / feedback not yet received' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_qsub_meeting',
            condition: { field: 'qsub_requested', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Q-Sub Meeting Requested',
            message:
              'A Pre-Submission (Q-Sub) meeting with FDA is strongly recommended before filing a PMA for a Class III device. Without FDA feedback on study design and data requirements, there is a risk of a major deficiency letter or additional information request that could significantly delay approval.',
            reference: 'FDA Guidance: Requests for Feedback and Meetings for Medical Device Submissions: The Q-Submission Program (2023)',
          },
        ],
        defaultNext: 'submission_planning',
      },

      {
        id: 'submission_planning',
        section: 'Submission Strategy',
        question:
          'Describe the PMA submission plan, including modular submission strategy, target dates, and anticipated review timeline.',
        guidance:
          'Per 21 CFR 814.20 and FDA Guidance "Acceptance and Filing Reviews for Premarket Approval Applications (PMAs)" (2003), FDA conducts a 45-day filing review followed by a 180-day substantive review. The total review time can be significantly longer if additional information is requested. Modular PMA submissions (21 CFR 814.20(c)) allow submission of completed sections before the final module, potentially reducing overall review time. Third-party review is not available for PMA applications. Consider FDA user fee implications per MDUFA (Medical Device User Fee Amendments).',
        fields: [
          {
            id: 'modular_submission',
            label: 'Modular PMA Submission',
            type: 'yes_no',
            helpText: 'Per 21 CFR 814.20(c), modular PMA submissions allow filing completed modules (e.g., nonclinical, manufacturing) before the clinical data module is ready.',
          },
          {
            id: 'modules_submitted',
            label: 'Modules Already Submitted',
            type: 'multi_select',
            visibleWhen: { field: 'modular_submission', operator: 'eq', value: true },
            options: [
              { value: 'device_description', label: 'Device Description' },
              { value: 'manufacturing', label: 'Manufacturing Information' },
              { value: 'nonclinical', label: 'Nonclinical (Bench & Biocompatibility)' },
              { value: 'software', label: 'Software Documentation' },
              { value: 'sterilization', label: 'Sterilization Validation' },
              { value: 'clinical', label: 'Clinical Data' },
              { value: 'labeling', label: 'Labeling' },
              { value: 'none_yet', label: 'None submitted yet' },
            ],
          },
          {
            id: 'target_submission_date',
            label: 'Target Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'anticipated_review_timeline',
            label: 'Anticipated Review Timeline',
            type: 'select',
            options: [
              { value: 'standard_180', label: 'Standard 180-day review' },
              { value: 'priority_review', label: 'Priority Review (breakthrough device)' },
              { value: 'extended', label: 'Extended review anticipated (complex device)' },
            ],
            helpText: 'Per MDUFA goals, FDA targets a 180-day review for standard PMAs. Breakthrough device designation per Section 515B of the FD&C Act may provide expedited review.',
          },
          {
            id: 'third_party_review',
            label: 'Third-Party Review Applicable',
            type: 'yes_no',
            helpText: 'Third-party review per 21 CFR 814 is generally not available for original PMA applications.',
          },
        ],
        defaultNext: 'panel_preparation',
      },

      {
        id: 'panel_preparation',
        section: 'Submission Strategy',
        question:
          'Is an advisory panel meeting expected? Describe the panel preparation status and anticipated review issues.',
        guidance:
          'Per 21 CFR 814.44 and Section 515(c)(3) of the FD&C Act, FDA may refer PMA applications to an advisory panel for review and recommendation. Panel meetings are common for novel Class III devices, first-of-a-kind technologies, or devices with borderline benefit-risk profiles. The panel provides a non-binding recommendation to FDA. Preparation should include a clear presentation of the benefit-risk assessment, responses to anticipated panel questions, key opinion leader engagement, and rehearsal of the sponsor presentation. FDA typically provides 30 days notice before a panel meeting and shares panel questions in advance.',
        fields: [
          {
            id: 'advisory_panel_expected',
            label: 'Advisory Panel Meeting Expected',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 814.44, FDA may refer PMAs to an advisory panel. Panel review is common for novel devices and first approvals in a new device category.',
          },
          {
            id: 'panel_preparation_status',
            label: 'Panel Preparation Status',
            type: 'select',
            visibleWhen: { field: 'advisory_panel_expected', operator: 'eq', value: true },
            options: [
              { value: 'not_started', label: 'Not started' },
              { value: 'in_preparation', label: 'In preparation — materials being developed' },
              { value: 'ready', label: 'Ready — presentation and materials finalized' },
              { value: 'completed', label: 'Panel meeting already completed' },
            ],
          },
          {
            id: 'anticipated_review_issues',
            label: 'Anticipated Review Issues',
            type: 'textarea',
            placeholder: 'e.g., 1) Long-term durability beyond 5 years not yet demonstrated, 2) Higher-than-expected pacemaker rate, 3) Limited data in low-risk patient populations, 4) Comparative effectiveness vs. surgical alternative.',
            helpText: 'Identify potential concerns that FDA or the advisory panel may raise, and prepare responses for each.',
          },
          {
            id: 'key_messages_for_panel',
            label: 'Key Messages for Panel',
            type: 'textarea',
            visibleWhen: { field: 'advisory_panel_expected', operator: 'eq', value: true },
            placeholder: 'e.g., 1) Favorable benefit-risk in the intended population (high/extreme risk), 2) Mortality reduction vs. medical management, 3) Consistent results across subgroups, 4) Robust post-market surveillance plan to address remaining questions.',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
      },
    ],
  };
}
