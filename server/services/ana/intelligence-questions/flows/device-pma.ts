/**
 * PMA (Premarket Approval) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides medtech sponsors through a comprehensive PMA submission
 * questionnaire covering device overview & classification, predicate &
 * comparison, design & manufacturing, preclinical testing &
 * biocompatibility, clinical evidence, software & cybersecurity,
 * labeling & human factors, and post-market surveillance per 21 CFR 814.
 *
 * 22 nodes · 90+ fields · 8 sections · 14 issue checks
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
      'Premarket Approval Application questionnaire for Class III medical devices covering device overview & classification, predicate & comparison, design & manufacturing, preclinical testing & biocompatibility, clinical evidence, software & cybersecurity, labeling & human factors, and post-market surveillance per 21 CFR 814.',
    clientTypes: ['medtech'],
    entryNode: 'pma_device_overview',
    estimatedMinutes: 50,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'device_overview_classification',
        label: 'Device Overview & Classification',
        nodeIds: ['pma_device_overview', 'pma_device_classification', 'pma_combination_product'],
      },
      {
        id: 'predicate_comparison',
        label: 'Predicate & Comparison',
        nodeIds: ['pma_predicate_device', 'pma_predicate_comparison'],
      },
      {
        id: 'design_manufacturing',
        label: 'Design & Manufacturing',
        nodeIds: ['pma_design_controls', 'pma_manufacturing', 'pma_sterilization'],
      },
      {
        id: 'preclinical_biocompatibility',
        label: 'Preclinical Testing & Biocompatibility',
        nodeIds: ['pma_bench_testing', 'pma_biocompatibility', 'pma_animal_studies'],
      },
      {
        id: 'clinical_evidence',
        label: 'Clinical Evidence',
        nodeIds: ['pma_clinical_study', 'pma_clinical_results', 'pma_clinical_safety'],
      },
      {
        id: 'software_cybersecurity',
        label: 'Software & Cybersecurity',
        nodeIds: ['pma_software_lifecycle', 'pma_cybersecurity'],
      },
      {
        id: 'labeling_human_factors',
        label: 'Labeling & Human Factors',
        nodeIds: ['pma_labeling', 'pma_human_factors'],
      },
      {
        id: 'post_market_surveillance',
        label: 'Post-Market Surveillance',
        nodeIds: [
          'pma_risk_management',
          'pma_post_approval_study',
          'pma_post_market_plan',
        ],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Device Overview & Classification                     */
      /* ================================================================ */

      {
        id: 'pma_device_overview',
        section: 'Device Overview & Classification',
        question:
          'Let\'s begin your PMA application. Describe the device, its intended use, and submission type.',
        guidance:
          'Per 21 CFR 814.20(b)(3), a PMA must include a complete description of the device including pictorial representations, engineering drawings, and principles of operation. The intended use statement per 21 CFR 814.20(b)(3)(i) must describe the disease or condition the device will diagnose, treat, prevent, cure, or mitigate. Original PMAs require the full evidentiary package per 21 CFR 814.20(b). PMA supplements are governed by 21 CFR 814.39.',
        provideExpertFeedback: true,
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
            label: 'Device Common / Generic Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., Transcatheter aortic valve replacement prosthesis',
            helpText: 'The generic descriptor used by FDA to categorize the device.',
          },
          {
            id: 'intended_use',
            label: 'Intended Use / Indications for Use',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The device is indicated for the treatment of symptomatic severe aortic stenosis in patients who are at high or greater risk for open-heart surgery...',
            helpText: 'Per 21 CFR 814.20(b)(3)(i), include the disease/condition, patient population, and clinical setting.',
            validation: { minLength: 50 },
          },
          {
            id: 'device_description_detail',
            label: 'Detailed Device Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The device consists of a self-expanding nitinol frame with bovine pericardial tissue leaflets, a transfemoral delivery catheter system, and a loading tool...',
            helpText: 'Include components, materials of construction, dimensions, and principles of operation per 21 CFR 814.20(b)(3).',
            validation: { minLength: 100 },
          },
          {
            id: 'is_implantable',
            label: 'Is this device implantable?',
            type: 'yes_no',
            required: true,
            helpText: 'Implantable devices have additional requirements for biocompatibility, long-term durability, and post-market surveillance.',
          },
          {
            id: 'is_active_device',
            label: 'Is this an active (powered) device?',
            type: 'yes_no',
            required: true,
            helpText: 'Active devices rely on a source of energy (electrical, gas pressure, etc.) for operation and must comply with IEC 60601 standards.',
          },
          {
            id: 'energy_source',
            label: 'Energy Source',
            type: 'select',
            visibleWhen: { field: 'is_active_device', operator: 'eq', value: true },
            options: [
              { value: 'battery', label: 'Battery-powered' },
              { value: 'ac_mains', label: 'AC mains powered' },
              { value: 'radiofrequency', label: 'Radiofrequency' },
              { value: 'laser', label: 'Laser' },
              { value: 'ultrasound', label: 'Ultrasound' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        defaultNext: 'pma_device_classification',
      },

      {
        id: 'pma_device_classification',
        section: 'Device Overview & Classification',
        question:
          'Provide the regulatory classification details and identify whether the device is a combination product or contains software.',
        guidance:
          'Per 21 CFR 860, Class III devices require a PMA because general controls and special controls alone are insufficient to provide reasonable assurance of safety and effectiveness. The product code and regulation number link the device to its classification under 21 CFR Parts 862-892. Combination products (device + drug or biologic) are regulated under 21 CFR 3.2 and require designation of a lead center.',
        fields: [
          {
            id: 'product_code',
            label: 'FDA Product Code',
            type: 'text',
            required: true,
            placeholder: 'e.g., NIQ',
            helpText: 'Three-letter FDA product code from the Product Classification Database.',
          },
          {
            id: 'regulation_number',
            label: 'Regulation Number (21 CFR Part)',
            type: 'text',
            required: true,
            placeholder: 'e.g., 21 CFR 870.3925',
          },
          {
            id: 'classification_panel',
            label: 'FDA Classification Panel',
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
          {
            id: 'is_combination_product',
            label: 'Is this a combination product (device + drug/biologic)?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 3.2, a combination product includes components from two or more regulatory categories (drug, device, biologic). Requires RFD to CDRH/CDER/CBER.',
          },
          {
            id: 'contains_software',
            label: 'Does the device contain or consist of software?',
            type: 'yes_no',
            required: true,
            helpText: 'Software as a Medical Device (SaMD) or Software in a Medical Device (SiMD) requires documentation per IEC 62304 and FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023).',
          },
        ],
        branches: [
          {
            when: { field: 'is_combination_product', operator: 'eq', value: true },
            goto: 'pma_combination_product',
          },
        ],
        defaultNext: 'pma_predicate_device',
      },

      {
        id: 'pma_combination_product',
        section: 'Device Overview & Classification',
        question:
          'Describe the combination product components. What is the drug or biologic constituent, and which center has primary jurisdiction?',
        guidance:
          'Per 21 CFR 3.2(e) and FDA Guidance "Classification of Products as Drugs and Devices and Additional Product Classification Issues" (2017), combination products must have a designated lead review center. The Request for Designation (RFD) process under 21 CFR 3.7 determines whether CDRH, CDER, or CBER leads the review. The primary mode of action (PMOA) determines the lead center per 21 CFR 3.4. Cross-labeling, cGMP compliance for both constituents, and a co-development strategy are critical considerations.',
        fields: [
          {
            id: 'combination_type',
            label: 'Combination Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'device_drug', label: 'Device + Drug', description: 'e.g., drug-eluting stent, antimicrobial-coated catheter' },
              { value: 'device_biologic', label: 'Device + Biologic', description: 'e.g., tissue-engineered product, bone graft with growth factor' },
              { value: 'device_drug_biologic', label: 'Device + Drug + Biologic' },
            ],
          },
          {
            id: 'constituent_description',
            label: 'Drug / Biologic Constituent Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The device frame is coated with a polymer matrix containing sirolimus (rapamycin) at a concentration of 1.4 mcg/mm2. Total drug load per device ranges from 50-100 mcg depending on size.',
            validation: { minLength: 50 },
          },
          {
            id: 'lead_center',
            label: 'Lead Review Center',
            type: 'select',
            required: true,
            options: [
              { value: 'cdrh', label: 'CDRH (Center for Devices and Radiological Health)' },
              { value: 'cder', label: 'CDER (Center for Drug Evaluation and Research)' },
              { value: 'cber', label: 'CBER (Center for Biologics Evaluation and Research)' },
              { value: 'pending', label: 'RFD pending — not yet designated' },
            ],
          },
          {
            id: 'rfd_number',
            label: 'RFD Number',
            type: 'text',
            placeholder: 'e.g., RFD 2024-001234',
            helpText: 'Per 21 CFR 3.7, the Request for Designation number from FDA Office of Combination Products.',
          },
          {
            id: 'combination_cgmp_strategy',
            label: 'cGMP / QSR Compliance Strategy',
            type: 'textarea',
            placeholder: 'e.g., Device constituent manufactured under 21 CFR 820 (QSR). Drug constituent manufactured under 21 CFR 211 (cGMP). Combination product assembled under device cGMP with appropriate controls for drug constituent per 21 CFR 4.',
            helpText: 'Per 21 CFR Part 4, combination products must comply with current good manufacturing practice requirements applicable to each constituent part.',
          },
        ],
        defaultNext: 'pma_predicate_device',
      },

      /* ================================================================ */
      /*  Section 2 — Predicate & Comparison                               */
      /* ================================================================ */

      {
        id: 'pma_predicate_device',
        section: 'Predicate & Comparison',
        question:
          'Has a legally marketed predicate or comparable PMA-approved device been identified? Describe the comparison strategy.',
        guidance:
          'While PMA applications do not require a predicate device (unlike 510(k)), identifying comparable PMA-approved devices helps contextualize the safety and effectiveness profile per 21 CFR 814.20(b)(3)(v). For PMA supplements, the currently approved device is the reference. FDA advisory panels benefit from clear comparisons to existing therapies. Provide PMA numbers and product codes for all referenced devices.',
        fields: [
          {
            id: 'comparable_device_exists',
            label: 'Is there a comparable PMA-approved device on the market?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'comparable_device_name',
            label: 'Comparable Device Name(s)',
            type: 'textarea',
            visibleWhen: { field: 'comparable_device_exists', operator: 'eq', value: true },
            placeholder: 'e.g., 1) CoreValve Evolut R (Medtronic) — PMA P150021. 2) SAPIEN 3 (Edwards Lifesciences) — PMA P140031.',
          },
          {
            id: 'comparable_pma_numbers',
            label: 'PMA Number(s) of Comparable Devices',
            type: 'text',
            visibleWhen: { field: 'comparable_device_exists', operator: 'eq', value: true },
            placeholder: 'e.g., P150021, P140031',
          },
          {
            id: 'first_of_kind',
            label: 'Is this a first-of-a-kind device with no comparable approved devices?',
            type: 'yes_no',
            helpText: 'First-of-kind devices may require advisory panel review per 21 CFR 814.44 and face heightened evidentiary requirements.',
          },
        ],
        defaultNext: 'pma_predicate_comparison',
      },

      {
        id: 'pma_predicate_comparison',
        section: 'Predicate & Comparison',
        question:
          'Describe the similarities and differences between your device and the comparable devices, including technological characteristics and performance benchmarks.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(v), the PMA should include a comparison of performance data with comparable devices. This comparison helps FDA reviewers and advisory panels contextualize your device\'s benefit-risk profile. Key comparison dimensions include mechanism of action, materials, dimensions, delivery method, procedural approach, and published clinical outcomes of comparable devices.',
        fields: [
          {
            id: 'mechanism_comparison',
            label: 'Mechanism of Action Comparison',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Both devices are transcatheter heart valves using bovine pericardial leaflets. Subject device uses a self-expanding nitinol frame vs. balloon-expandable cobalt-chromium frame in the comparator.',
            validation: { minLength: 50 },
          },
          {
            id: 'performance_benchmarks',
            label: 'Performance Benchmarks / Objective Performance Criteria',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., OPC derived from published literature: composite of all-cause mortality + disabling stroke at 12 months ≤25% for high-risk; ≤35% for extreme-risk. Device-specific: paravalvular leak ≤ mild.',
            helpText: 'Objective Performance Criteria (OPC) may be established by FDA or derived from published data on comparable devices.',
          },
          {
            id: 'technological_differences',
            label: 'Key Technological Differences',
            type: 'textarea',
            placeholder: 'e.g., 1) Self-expanding vs. balloon-expandable deployment, 2) Supra-annular leaflet position vs. intra-annular, 3) Recapturable and repositionable delivery system, 4) 18F-compatible low-profile delivery catheter.',
          },
          {
            id: 'clinical_outcome_comparison',
            label: 'Published Clinical Outcomes of Comparable Devices',
            type: 'textarea',
            placeholder: 'e.g., CoreValve Evolut R: 12-month all-cause mortality 6.7% (high-risk). SAPIEN 3: 12-month all-cause mortality 7.4% (high-risk). Published in NEJM 2017, JAMA 2019.',
          },
        ],
        defaultNext: 'pma_design_controls',
      },

      /* ================================================================ */
      /*  Section 3 — Design & Manufacturing                               */
      /* ================================================================ */

      {
        id: 'pma_design_controls',
        section: 'Design & Manufacturing',
        question:
          'Describe the design controls, quality system, and ISO 13485 compliance status for this device.',
        guidance:
          'Per 21 CFR 820.30, design controls are mandatory for Class III devices. The Design History File (DHF) must document design inputs, outputs, reviews, verification, validation, and transfer. ISO 13485:2016 is the internationally recognized QMS standard for medical devices. FDA accepts ISO 13485 as evidence of QSR compliance via the Medical Device Single Audit Program (MDSAP). Design verification per 21 CFR 820.30(f) confirms outputs meet inputs; design validation per 21 CFR 820.30(g) confirms the device meets user needs under actual or simulated conditions.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'iso_13485_certified',
            label: 'ISO 13485:2016 Certification Status',
            type: 'select',
            required: true,
            options: [
              { value: 'certified', label: 'Certified — ISO 13485:2016 certificate held' },
              { value: 'in_progress', label: 'Certification in progress' },
              { value: 'not_certified', label: 'Not certified — relying on 21 CFR 820 compliance only' },
            ],
          },
          {
            id: 'design_controls_complete',
            label: 'Design Controls Completed (Design History File)',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.30, the DHF must document the entire design and development process including inputs, outputs, reviews, verification, validation, and transfer.',
          },
          {
            id: 'design_verification_complete',
            label: 'Design Verification Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.30(f), design verification confirms design outputs meet design input requirements through inspection, analysis, or testing.',
          },
          {
            id: 'design_validation_complete',
            label: 'Design Validation Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.30(g), design validation confirms the device meets user needs under actual or simulated use conditions.',
          },
          {
            id: 'capa_system_operational',
            label: 'CAPA System Operational',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 820.90, a Corrective and Preventive Action system must be established and maintained.',
          },
        ],
        issueChecks: [
          {
            id: 'manufacturing_not_iso_13485',
            condition: { field: 'iso_13485_certified', operator: 'eq', value: 'not_certified' },
            severity: 'warning',
            title: 'Manufacturing Not ISO 13485 Compliant',
            message:
              'ISO 13485:2016 certification is the internationally recognized QMS standard for medical devices. While not strictly required for FDA PMA approval (21 CFR 820 compliance is sufficient), ISO 13485 certification facilitates global market access and is accepted by FDA via MDSAP. Lack of certification may raise questions during the pre-approval inspection (PAI).',
            reference: 'ISO 13485:2016; 21 CFR 820',
          },
          {
            id: 'design_controls_incomplete',
            condition: { field: 'design_controls_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Design Controls Not Completed',
            message:
              'Design controls per 21 CFR 820.30 are mandatory for Class III devices. The Design History File (DHF) must document the complete design process. A PMA cannot be approved without evidence of design control compliance. FDA will review the DHF during the pre-approval inspection.',
            reference: '21 CFR 820.30',
          },
        ],
        defaultNext: 'pma_manufacturing',
      },

      {
        id: 'pma_manufacturing',
        section: 'Design & Manufacturing',
        question:
          'Describe the manufacturing process, manufacturing sites, and contract manufacturers.',
        guidance:
          'Per 21 CFR 814.20(b)(4) and 21 CFR 820, the PMA must include a complete description of manufacturing methods, facilities, and controls. All manufacturing sites must be registered with FDA per 21 CFR 807 and are subject to pre-approval inspection (PAI) per FDA Compliance Program 7382.845. Contract manufacturers must be identified with quality agreements per 21 CFR 820.50. Process validation per 21 CFR 820.75 is required for processes whose results cannot be fully verified by subsequent inspection and testing.',
        fields: [
          {
            id: 'manufacturing_description',
            label: 'Manufacturing Process Description',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Multi-step process: 1) Nitinol frame laser cutting and electropolishing, 2) Tissue processing and fixation, 3) Leaflet cutting and assembly, 4) Frame-leaflet integration, 5) Delivery system assembly, 6) Final inspection and packaging.',
            validation: { minLength: 50 },
          },
          {
            id: 'manufacturing_sites',
            label: 'Manufacturing Sites (with FEI numbers)',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Site 1: Primary assembly — Acme Medical, Minneapolis, MN (FEI: 1234567). Site 2: Nitinol machining — AlloyTech, San Jose, CA (FEI: 7654321).',
            helpText: 'Per 21 CFR 807, list all sites with FDA Establishment Identifier (FEI) numbers.',
          },
          {
            id: 'contract_manufacturers',
            label: 'Contract Manufacturers',
            type: 'textarea',
            placeholder: 'e.g., TissueProc LLC — bovine pericardium processing. MetalWorks Inc. — nitinol frame laser cutting.',
            helpText: 'Per 21 CFR 820.50, suppliers and contractors must be evaluated and quality agreements must be in place.',
          },
          {
            id: 'process_validations',
            label: 'Key Process Validations',
            type: 'multi_select',
            options: [
              { value: 'welding', label: 'Welding / Joining' },
              { value: 'coating', label: 'Surface Coating / Treatment' },
              { value: 'molding', label: 'Injection Molding' },
              { value: 'sealing', label: 'Sealing' },
              { value: 'cleaning', label: 'Cleaning' },
              { value: 'assembly', label: 'Assembly' },
              { value: 'labeling', label: 'Labeling / Printing' },
              { value: 'packaging', label: 'Packaging / Pouching' },
            ],
            helpText: 'Per 21 CFR 820.75, list all special processes requiring validation.',
          },
        ],
        defaultNext: 'pma_sterilization',
      },

      {
        id: 'pma_sterilization',
        section: 'Design & Manufacturing',
        question:
          'Describe the sterilization method, validation status, and environmental controls.',
        guidance:
          'Per 21 CFR 820.75, sterilization processes must be validated. Recognized standards include ISO 11135 (ethylene oxide), ISO 11137 (radiation), ISO 17665 (moist heat), and ISO 13408 (aseptic processing). A Sterility Assurance Level (SAL) of 10^-6 must be demonstrated. Environmental controls per ISO 14644 for cleanroom classification must be documented. Packaging validation per ISO 11607 ensures maintenance of sterility through shelf life.',
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
            id: 'sterilization_validated',
            label: 'Sterilization Validation Completed',
            type: 'yes_no',
            visibleWhen: { field: 'sterilization_method', operator: 'neq', value: 'not_sterile' },
            helpText: 'Per 21 CFR 820.75, validation must demonstrate a SAL of 10^-6 per the applicable ISO standard.',
          },
          {
            id: 'sterilization_validation_summary',
            label: 'Sterilization Validation Summary',
            type: 'textarea',
            visibleWhen: { field: 'sterilization_method', operator: 'neq', value: 'not_sterile' },
            placeholder: 'e.g., EtO sterilization validated per ISO 11135 with three consecutive half-cycle runs. SAL of 10^-6 demonstrated. Bioburden per ISO 11737-1. Residual EtO/ECH per ISO 10993-7.',
          },
          {
            id: 'environmental_controls',
            label: 'Environmental Controls / Cleanroom Classification',
            type: 'textarea',
            placeholder: 'e.g., ISO Class 7 cleanroom for assembly per ISO 14644-1. Continuous particle and viable monitoring. Annual requalification.',
            helpText: 'Per 21 CFR 820.70(c), environmental conditions must prevent device contamination.',
          },
          {
            id: 'packaging_validation',
            label: 'Packaging Validation (ISO 11607)',
            type: 'yes_no',
            helpText: 'Per ISO 11607-1/-2, sterile barrier system must be validated for forming, sealing, and integrity through shelf life.',
          },
        ],
        issueChecks: [
          {
            id: 'sterilization_not_validated',
            condition: { field: 'sterilization_validated', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Sterilization Not Validated',
            message:
              'Sterilization process validation per 21 CFR 820.75 is required for devices supplied sterile. The validation must demonstrate a Sterility Assurance Level (SAL) of 10^-6 per the applicable ISO standard.',
            reference: '21 CFR 820.75; ISO 11135; ISO 11137; ISO 17665',
          },
        ],
        defaultNext: 'pma_bench_testing',
      },

      /* ================================================================ */
      /*  Section 4 — Preclinical Testing & Biocompatibility               */
      /* ================================================================ */

      {
        id: 'pma_bench_testing',
        section: 'Preclinical Testing & Biocompatibility',
        question:
          'Describe the bench testing program, including performance testing, mechanical testing, durability, and shelf life.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(v), the PMA must include a summary of all nonclinical laboratory studies. Bench testing should address device performance, mechanical integrity, fatigue/durability (per applicable ASTM/ISO standards), and shelf life stability per FDA Guidance "Shelf Life of Medical Devices" (1991). Testing should be conducted under worst-case conditions and simulated physiological loading. For implantable devices, accelerated fatigue testing should demonstrate performance through the expected service life.',
        fields: [
          {
            id: 'performance_test_summary',
            label: 'Performance Test Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Hydrodynamic performance testing in pulsatile flow loop per ISO 5840-3. Effective orifice area, regurgitant fraction, and pressure gradient measured across all device sizes.',
            validation: { minLength: 50 },
          },
          {
            id: 'mechanical_testing',
            label: 'Mechanical Testing',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Radial force, crush resistance, tensile strength, and suture retention testing per ASTM F2477 and ISO 25539-2.',
          },
          {
            id: 'durability_fatigue_testing',
            label: 'Durability / Fatigue Testing',
            type: 'textarea',
            placeholder: 'e.g., Accelerated fatigue testing to 600M cycles (15-year equivalent) per ASTM F2477. Tested under physiological conditions (37°C, pH 7.4, pulsatile flow). No frame fractures observed.',
            helpText: 'Durability testing should simulate the expected service life under worst-case physiological conditions.',
          },
          {
            id: 'shelf_life_testing',
            label: 'Shelf Life / Aging Studies',
            type: 'textarea',
            placeholder: 'e.g., Real-time aging at 25°C/60% RH through 36 months. Accelerated aging per ASTM F1980. Package integrity per ASTM F2095/F1585.',
          },
          {
            id: 'bench_testing_adequate',
            label: 'Is the bench testing program complete and adequate?',
            type: 'yes_no',
            required: true,
          },
        ],
        issueChecks: [
          {
            id: 'insufficient_bench_testing',
            condition: { field: 'bench_testing_adequate', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Insufficient Bench Testing',
            message:
              'Per 21 CFR 814.20(b)(3)(v), the PMA must include complete nonclinical test data. Insufficient bench testing may result in a major deficiency letter. Ensure all relevant performance, mechanical, durability, and shelf life tests are completed before PMA filing.',
            reference: '21 CFR 814.20(b)(3)(v)',
          },
        ],
        defaultNext: 'pma_biocompatibility',
      },

      {
        id: 'pma_biocompatibility',
        section: 'Preclinical Testing & Biocompatibility',
        question:
          'Describe the biocompatibility evaluation per ISO 10993 for all patient-contacting materials.',
        guidance:
          'Per ISO 10993-1:2018 and FDA Guidance "Use of International Standard ISO 10993-1" (2023), a comprehensive biological evaluation must be performed. The evaluation framework considers contact type (surface, external communicating, implant), contact duration (limited, prolonged, permanent), and the risk-based approach to testing. For Class III permanent implants, the full biocompatibility test battery is typically required, including cytotoxicity, sensitization, irritation/intracutaneous reactivity, systemic toxicity (acute and subchronic), genotoxicity, implantation, and hemocompatibility (ISO 10993-4 for blood-contacting devices). Chemical characterization per ISO 10993-18 is foundational.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'biocompatibility_evaluation_complete',
            label: 'ISO 10993 Biological Evaluation Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'contact_type',
            label: 'Contact Type (ISO 10993-1 Table A.1)',
            type: 'select',
            required: true,
            options: [
              { value: 'surface_skin', label: 'Surface — Skin contact' },
              { value: 'surface_mucosal', label: 'Surface — Mucosal membrane' },
              { value: 'surface_breached', label: 'Surface — Breached/compromised surface' },
              { value: 'ext_blood_indirect', label: 'External communicating — Blood path, indirect' },
              { value: 'ext_tissue_bone', label: 'External communicating — Tissue/bone/dentin' },
              { value: 'ext_circulating_blood', label: 'External communicating — Circulating blood' },
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
            id: 'biocompatibility_tests',
            label: 'Biocompatibility Tests Completed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'cytotoxicity', label: 'Cytotoxicity (ISO 10993-5)' },
              { value: 'sensitization', label: 'Sensitization (ISO 10993-10)' },
              { value: 'irritation', label: 'Irritation / Intracutaneous Reactivity (ISO 10993-10)' },
              { value: 'systemic_acute', label: 'Acute Systemic Toxicity (ISO 10993-11)' },
              { value: 'systemic_subchronic', label: 'Subchronic Systemic Toxicity (ISO 10993-11)' },
              { value: 'genotoxicity', label: 'Genotoxicity (ISO 10993-3)' },
              { value: 'implantation', label: 'Implantation (ISO 10993-6)' },
              { value: 'hemocompatibility', label: 'Hemocompatibility (ISO 10993-4)' },
              { value: 'chronic_toxicity', label: 'Chronic Toxicity (ISO 10993-11)' },
              { value: 'carcinogenicity', label: 'Carcinogenicity (ISO 10993-3)' },
              { value: 'reproductive', label: 'Reproductive/Developmental Toxicity (ISO 10993-11)' },
              { value: 'degradation', label: 'Degradation (ISO 10993-9/13/14/15)' },
              { value: 'chemical_characterization', label: 'Chemical Characterization (ISO 10993-18)' },
            ],
          },
          {
            id: 'materials_list',
            label: 'Patient-Contacting Materials',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Nitinol (NiTi alloy) frame, glutaraldehyde-fixed bovine pericardium, polyester fabric skirt, PTFE sutures, stainless steel crimping components.',
            helpText: 'Per 21 CFR 814.20(b)(3)(ii), list all materials in direct or indirect patient contact.',
          },
          {
            id: 'extractables_leachables',
            label: 'Extractables & Leachables Assessment',
            type: 'textarea',
            placeholder: 'e.g., Chemical characterization per ISO 10993-18 completed. Toxicological risk assessment per ISO 10993-17 for all identified compounds. No compounds exceed tolerable intake thresholds.',
          },
        ],
        issueChecks: [
          {
            id: 'inadequate_biocompatibility',
            condition: { field: 'biocompatibility_evaluation_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Inadequate Biocompatibility Evaluation',
            message:
              'A comprehensive biological evaluation per ISO 10993-1:2018 is mandatory for Class III devices. Without this evaluation, the PMA cannot establish device biocompatibility and safety. The evaluation must be risk-based and cover all patient-contacting materials with chemical characterization per ISO 10993-18.',
            reference: 'ISO 10993-1:2018; FDA Guidance: Use of ISO 10993-1 (2023); 21 CFR 814.20(b)(3)(v)',
          },
        ],
        defaultNext: 'pma_animal_studies',
      },

      {
        id: 'pma_animal_studies',
        section: 'Preclinical Testing & Biocompatibility',
        question:
          'Were animal studies conducted? Describe the study design, model selection, and results.',
        guidance:
          'Per FDA Guidance "General Considerations for Animal Studies Intended to Evaluate Medical Devices" (2023), animal studies should be scientifically justified and follow GLP (21 CFR Part 58) where feasible. The animal model should approximate human anatomy and physiology relevant to the device\'s mechanism of action. Study endpoints should include device performance, host tissue response (histopathology), and safety observations. For implantable devices, chronic implant duration should be sufficient to assess the long-term tissue-device interaction.',
        fields: [
          {
            id: 'animal_studies_conducted',
            label: 'Were animal studies conducted?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'animal_model',
            label: 'Animal Model',
            type: 'text',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            placeholder: 'e.g., Juvenile ovine model (40-50 kg sheep)',
          },
          {
            id: 'animal_study_design',
            label: 'Animal Study Design',
            type: 'textarea',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            placeholder: 'e.g., Chronic implant study: n=20 sheep, 180-day follow-up. Hemodynamic assessments at 30, 90, and 180 days. Terminal explant with histopathology. GLP-compliant per 21 CFR Part 58.',
          },
          {
            id: 'animal_study_results',
            label: 'Animal Study Results Summary',
            type: 'textarea',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            placeholder: 'e.g., All devices remained functional through 180 days. No migration, embolization, or structural failure. Histopathology showed complete endothelialization of the prosthesis frame. Minimal inflammatory response at the device-tissue interface.',
            validation: { minLength: 50 },
          },
          {
            id: 'glp_compliant',
            label: 'Were animal studies GLP-compliant (21 CFR Part 58)?',
            type: 'yes_no',
            visibleWhen: { field: 'animal_studies_conducted', operator: 'eq', value: true },
            helpText: 'GLP compliance per 21 CFR Part 58 is expected for pivotal animal studies supporting a PMA.',
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'pma_software_lifecycle',
          },
        ],
        defaultNext: 'pma_clinical_study',
      },

      /* ================================================================ */
      /*  Section 5 — Clinical Evidence                                    */
      /* ================================================================ */

      {
        id: 'pma_clinical_study',
        section: 'Clinical Evidence',
        question:
          'Describe the clinical study supporting this PMA, including IDE details, study design, and endpoints.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(vi) and 21 CFR 814.20(b)(6), the PMA must include results from clinical investigations involving human subjects. An IDE per 21 CFR 812 is required for significant-risk device studies. The study design should follow FDA Guidance "Design Considerations for Pivotal Clinical Investigations for Medical Devices" (2013) and ICH E9. The primary endpoint, sample size, follow-up duration, and control strategy must be clearly described and statistically justified.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'ide_study_conducted',
            label: 'IDE Study Conducted',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 812, a significant-risk device study requires an approved IDE before enrollment.',
          },
          {
            id: 'ide_number',
            label: 'IDE Number',
            type: 'text',
            visibleWhen: { field: 'ide_study_conducted', operator: 'eq', value: true },
            placeholder: 'e.g., G120345',
          },
          {
            id: 'study_design',
            label: 'Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial (RCT)' },
              { value: 'single_arm_opc', label: 'Single-Arm with Objective Performance Criteria' },
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
              { value: 'active_comparator', label: 'Active Comparator (standard of care)' },
              { value: 'sham', label: 'Sham Control' },
              { value: 'historical_opc', label: 'Historical Control / OPC' },
              { value: 'none', label: 'No Control (single-arm)' },
            ],
          },
          {
            id: 'number_of_sites',
            label: 'Number of Investigational Sites',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'subjects_enrolled',
            label: 'Number of Subjects Enrolled',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Composite of all-cause mortality and disabling stroke at 12 months, compared to OPC of 25%.',
            validation: { minLength: 30 },
          },
          {
            id: 'follow_up_months',
            label: 'Follow-Up Duration (months)',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'FDA typically requires minimum 12-month follow-up for implantable devices, longer for permanent implants.',
          },
          {
            id: 'sample_size_justification',
            label: 'Sample Size Justification',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., 325 subjects provide 90% power to detect a true event rate of 15% vs. OPC of 25% (one-sided alpha=0.025, exact binomial test). Assumes 10% dropout.',
            validation: { minLength: 50 },
          },
        ],
        issueChecks: [
          {
            id: 'no_clinical_data_class_iii',
            condition: { field: 'ide_study_conducted', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Clinical Data for Class III Device',
            message:
              'A PMA for a Class III device requires clinical data from an IDE study (21 CFR 812). Without clinical evidence from a controlled investigation, the PMA cannot demonstrate reasonable assurance of safety and effectiveness per 21 CFR 814.20(b)(3)(vi). This is a fundamental evidentiary requirement that cannot be waived.',
            reference: '21 CFR 812; 21 CFR 814.20(b)(3)(vi)',
          },
        ],
        defaultNext: 'pma_clinical_results',
      },

      {
        id: 'pma_clinical_results',
        section: 'Clinical Evidence',
        question:
          'Summarize the clinical results: was the primary endpoint met? Provide efficacy and statistical analysis details.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(vi)(A), the PMA must include all clinical investigation results, both favorable and unfavorable. Present the primary endpoint analysis with statistical methods, confidence intervals, and p-values per ICH E9. Both ITT and per-protocol analyses should be reported. Include subgroup analyses, missing data handling per ICH E9(R1), and sensitivity analyses.',
        fields: [
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'efficacy_results',
            label: 'Efficacy Results Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Primary composite endpoint at 12 months: 8.5% (95% CI: 5.2-11.8%) vs. OPC of 25% (p<0.001). All prespecified secondary endpoints met.',
            validation: { minLength: 50 },
          },
          {
            id: 'statistical_analysis_summary',
            label: 'Statistical Analysis Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., One-sample exact binomial test. 95% upper confidence bound: 11.8%, below OPC of 25%. p<0.001. Both ITT and per-protocol analyses consistent.',
          },
          {
            id: 'analysis_population',
            label: 'Primary Analysis Population',
            type: 'select',
            required: true,
            options: [
              { value: 'itt', label: 'Intent-to-Treat (ITT)' },
              { value: 'per_protocol', label: 'Per-Protocol' },
              { value: 'both_reported', label: 'Both ITT and Per-Protocol reported' },
              { value: 'modified_itt', label: 'Modified ITT (mITT)' },
            ],
          },
          {
            id: 'missing_data_strategy',
            label: 'Missing Data Handling',
            type: 'select',
            required: true,
            options: [
              { value: 'complete_case', label: 'Complete Case Analysis' },
              { value: 'multiple_imputation', label: 'Multiple Imputation' },
              { value: 'worst_case', label: 'Worst-Case Imputation' },
              { value: 'mmrm', label: 'Mixed Models (MMRM)' },
              { value: 'estimand', label: 'Estimand-Based Framework (ICH E9(R1))' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Per ICH E9(R1), the estimand framework should guide the approach to intercurrent events and missing data.',
          },
        ],
        issueChecks: [
          {
            id: 'primary_endpoint_not_met',
            condition: { field: 'primary_endpoint_met', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Primary Endpoint Not Met',
            message:
              'Failure to meet the primary endpoint significantly weakens the evidentiary basis for PMA approval. FDA may require additional studies or expanded analyses. Consider whether secondary endpoints, subgroup analyses, or a modified indication could support the benefit-risk determination.',
            reference: '21 CFR 814.20(b)(3)(vi); ICH E9',
          },
        ],
        defaultNext: 'pma_clinical_safety',
      },

      {
        id: 'pma_clinical_safety',
        section: 'Clinical Evidence',
        question:
          'Provide the clinical safety data, including adverse events, device-related events, and the overall benefit-risk assessment.',
        guidance:
          'Per 21 CFR 814.20(b)(3)(vi)(B), the PMA must include a summary of safety information. Device-related adverse events must be distinguished from procedure-related and unrelated events. UADEs per 21 CFR 812.150(b)(1) require reporting within 10 working days. Per FDA Guidance "Factors to Consider Regarding Benefit-Risk" (2016), the five-factor benefit-risk framework evaluates: probable benefit, probable risk, alternative treatment benefits, alternative treatment risks, and other relevant factors. The overall residual risk must be acceptable per ISO 14971:2019.',
        fields: [
          {
            id: 'total_adverse_events',
            label: 'Total Adverse Events',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'device_related_aes',
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
            helpText: 'Per 21 CFR 812.150(a)(1): death, life-threatening, hospitalization, disability, or congenital anomaly.',
          },
          {
            id: 'unanticipated_adverse_effects',
            label: 'Unanticipated Adverse Device Effects (UADEs)',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'safety_narrative',
            label: 'Safety Narrative Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Most common AEs: vascular access complications (12%), conduction disturbances requiring pacemaker (8%), paravalvular leak (5%). No device migration or structural failure.',
            validation: { minLength: 50 },
          },
          {
            id: 'benefit_risk_summary',
            label: 'Benefit-Risk Assessment Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., The device provides a less invasive treatment for high-risk patients with 12-month mortality of 8.5% vs. 30% with medical management. The favorable benefit-risk profile is supported by consistent results across all prespecified subgroups.',
            helpText: 'Per 21 CFR 814.44(d) and FDA benefit-risk guidance, the probable benefits must outweigh the probable risks.',
            validation: { minLength: 100 },
          },
          {
            id: 'comparison_to_alternatives',
            label: 'Comparison to Alternative Treatments',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Alternatives: (1) Surgical valve replacement — 30-day mortality 4-8% standard risk, >15% high risk; (2) Medical management — 1-year mortality 30-50%; (3) Balloon valvuloplasty — palliative only.',
          },
        ],
        branches: [
          {
            when: { field: 'contains_software', operator: 'eq', value: true },
            goto: 'pma_software_lifecycle',
          },
        ],
        defaultNext: 'pma_labeling',
      },

      /* ================================================================ */
      /*  Section 6 — Software & Cybersecurity (conditional)               */
      /* ================================================================ */

      {
        id: 'pma_software_lifecycle',
        section: 'Software & Cybersecurity',
        question:
          'Describe the software lifecycle documentation per IEC 62304, including safety classification, development process, and verification/validation.',
        guidance:
          'Per IEC 62304:2006/AMD1:2015 and FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023), software in Class III devices must be classified (Class A, B, or C) based on hazard severity from software failure. Class C software (death or serious injury possible) requires the most rigorous documentation. The software development lifecycle must include requirements specification, architecture design, detailed design, unit testing, integration testing, system testing, and a requirements traceability matrix. FDA expects complete Level of Concern documentation aligned with the IEC 62304 software safety class.',
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
              { value: 'not_classified', label: 'Not yet classified' },
            ],
            helpText: 'Per IEC 62304, the software safety class determines the rigor of the development lifecycle process.',
          },
          {
            id: 'software_documentation_status',
            label: 'Software Documentation Completed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'srs', label: 'Software Requirements Specification (SRS)' },
              { value: 'architecture', label: 'Software Architecture Design' },
              { value: 'detailed_design', label: 'Detailed Software Design' },
              { value: 'unit_tests', label: 'Unit Testing Reports' },
              { value: 'integration_tests', label: 'Integration Testing Reports' },
              { value: 'system_tests', label: 'System Testing Reports' },
              { value: 'traceability', label: 'Requirements Traceability Matrix' },
              { value: 'anomaly_list', label: 'Software Anomaly / Known Bugs List' },
              { value: 'maintenance_plan', label: 'Software Maintenance Plan' },
            ],
          },
          {
            id: 'software_validation_complete',
            label: 'Software Verification & Validation Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Per IEC 62304 Clause 5.7 and FDA Guidance, V&V must demonstrate software performs as intended and is free from unacceptable anomalies.',
          },
          {
            id: 'iec_60601_testing',
            label: 'IEC 60601-1 Electrical Safety Testing Completed',
            type: 'yes_no',
            visibleWhen: { field: 'is_active_device', operator: 'eq', value: true },
            helpText: 'Per IEC 60601-1:2005+A1+A2, testing covers electrical safety including protection against electric shock, mechanical hazards, and temperature limits.',
          },
          {
            id: 'emc_testing',
            label: 'EMC Testing Completed (IEC 60601-1-2)',
            type: 'yes_no',
            visibleWhen: { field: 'is_active_device', operator: 'eq', value: true },
            helpText: 'Per IEC 60601-1-2:2014+A1:2020, electromagnetic compatibility testing is required for all electrically powered medical devices.',
          },
        ],
        issueChecks: [
          {
            id: 'software_not_validated_iec_62304',
            condition: { field: 'iec_62304_class', operator: 'eq', value: 'not_classified' },
            severity: 'critical',
            title: 'Software Not Classified per IEC 62304',
            message:
              'Software in a Class III device must be classified per IEC 62304:2006/AMD1:2015. The safety class determines documentation rigor. FDA expects complete software documentation per "Content of Premarket Submissions for Device Software Functions" guidance (2023). Without classification, the software lifecycle documentation strategy cannot be determined.',
            reference: 'IEC 62304:2006/AMD1:2015; FDA Guidance: Content of Premarket Submissions for Device Software Functions (2023)',
          },
          {
            id: 'software_vv_incomplete',
            condition: { field: 'software_validation_complete', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Software Verification & Validation Not Complete',
            message:
              'Software V&V per IEC 62304 and FDA guidance must be completed before PMA submission. Incomplete V&V will result in a major deficiency finding during FDA review.',
            reference: 'IEC 62304:2006/AMD1:2015 Clause 5.7',
          },
        ],
        defaultNext: 'pma_cybersecurity',
      },

      {
        id: 'pma_cybersecurity',
        section: 'Software & Cybersecurity',
        question:
          'Describe the cybersecurity risk assessment and documentation for this device.',
        guidance:
          'Per FDA Guidance "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions" (2023), all devices containing software must include a cybersecurity risk assessment. The assessment must follow the NIST Cybersecurity Framework and address threat modeling, security architecture, vulnerability testing (penetration testing, fuzz testing), Software Bill of Materials (SBOM), and a plan for addressing post-market cybersecurity vulnerabilities. Devices with network connectivity, wireless capability, or data exchange features require enhanced cybersecurity documentation.',
        fields: [
          {
            id: 'cybersecurity_risk_assessment',
            label: 'Cybersecurity Risk Assessment Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Cybersecurity Guidance (2023), a threat model and cybersecurity risk assessment are required for all devices containing software.',
          },
          {
            id: 'device_connectivity',
            label: 'Device Connectivity',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'network', label: 'Wired Network (Ethernet)' },
              { value: 'wifi', label: 'Wireless (Wi-Fi)' },
              { value: 'bluetooth', label: 'Bluetooth / BLE' },
              { value: 'usb', label: 'USB' },
              { value: 'cloud', label: 'Cloud Connected' },
              { value: 'mobile_app', label: 'Companion Mobile App' },
              { value: 'none', label: 'No Connectivity — standalone device' },
            ],
          },
          {
            id: 'threat_modeling',
            label: 'Threat Modeling Completed',
            type: 'yes_no',
            helpText: 'Per FDA Guidance, threat modeling should identify attack surfaces, threat actors, and potential impact to patient safety.',
          },
          {
            id: 'sbom_generated',
            label: 'Software Bill of Materials (SBOM) Generated',
            type: 'yes_no',
            helpText: 'Per FDA Guidance (2023) and Executive Order 14028, an SBOM listing all software components (including open-source) is required.',
          },
          {
            id: 'penetration_testing',
            label: 'Penetration Testing / Vulnerability Assessment Completed',
            type: 'yes_no',
            helpText: 'Per FDA Guidance, security testing should include penetration testing, fuzz testing, and static/dynamic code analysis.',
          },
          {
            id: 'patch_update_plan',
            label: 'Patch / Update Management Plan',
            type: 'textarea',
            placeholder: 'e.g., Validated software update mechanism supporting authenticated and encrypted OTA updates. Critical security patches deployed within 60 days. Vulnerability disclosure policy published on company website.',
            helpText: 'Per FDA Guidance (2023), a plan for addressing post-market cybersecurity vulnerabilities must be described.',
          },
        ],
        issueChecks: [
          {
            id: 'cybersecurity_risk_not_assessed',
            condition: { field: 'cybersecurity_risk_assessment', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Cybersecurity Risk Not Assessed',
            message:
              'Per FDA Guidance "Cybersecurity in Medical Devices" (2023), a cybersecurity risk assessment is required for all devices containing software. Failure to include cybersecurity documentation will result in a Refuse to Accept decision. The assessment must cover threat modeling, security architecture, vulnerability testing, SBOM, and post-market vulnerability management.',
            reference: 'FDA Guidance: Cybersecurity in Medical Devices (2023); NIST Cybersecurity Framework',
          },
        ],
        defaultNext: 'pma_labeling',
      },

      /* ================================================================ */
      /*  Section 7 — Labeling & Human Factors                             */
      /* ================================================================ */

      {
        id: 'pma_labeling',
        section: 'Labeling & Human Factors',
        question:
          'Describe the proposed device labeling, including instructions for use, warnings, contraindications, and patient labeling.',
        guidance:
          'Per 21 CFR 814.20(b)(7) and 21 CFR 801, the PMA must include proposed labeling. Labeling must contain adequate directions for use per 21 CFR 801.5, warnings per 21 CFR 801.109, contraindications, and MR safety information per ASTM F2503 (if applicable). For implantable devices, patient labeling per FDA Guidance "Patient Labeling" (2001) and implant cards per 21 CFR 821 (device tracking) and 21 CFR 830 (UDI) are typically required.',
        fields: [
          {
            id: 'ifu_drafted',
            label: 'Instructions for Use (IFU) Drafted',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'physician_labeling',
            label: 'Physician Labeling Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Device description, indications, contraindications, warnings/precautions, patient selection, procedure steps, troubleshooting, AEs, clinical study summary, how supplied.',
          },
          {
            id: 'warnings_precautions',
            label: 'Warnings and Precautions',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., WARNING: Device should only be implanted by trained physicians. PRECAUTION: Anticoagulation required per institutional protocol.',
          },
          {
            id: 'contraindications',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Active endocarditis, known sensitivity to nitinol or bovine tissue, inadequate annulus size.',
          },
          {
            id: 'patient_labeling_included',
            label: 'Patient-Directed Labeling Included',
            type: 'yes_no',
            helpText: 'Per FDA Guidance "Patient Labeling" (2001), patient materials should be at or below an 8th grade reading level.',
          },
          {
            id: 'mr_safety_labeling',
            label: 'MR Safety Classification',
            type: 'select',
            options: [
              { value: 'mr_safe', label: 'MR Safe' },
              { value: 'mr_conditional', label: 'MR Conditional — conditions specified in labeling' },
              { value: 'mr_unsafe', label: 'MR Unsafe' },
              { value: 'not_applicable', label: 'Not applicable — non-implantable device' },
              { value: 'not_tested', label: 'MR testing not yet completed' },
            ],
            helpText: 'Per ASTM F2503, MR safety must be classified and labeled appropriately.',
          },
          {
            id: 'implant_card',
            label: 'Implant Card Planned',
            type: 'yes_no',
            visibleWhen: { field: 'is_implantable', operator: 'eq', value: true },
            helpText: 'Per 21 CFR 821 and UDI requirements (21 CFR 830), implantable devices typically require patient implant cards.',
          },
          {
            id: 'training_program',
            label: 'Physician Training Program',
            type: 'textarea',
            placeholder: 'e.g., Proctored training: didactic session, simulation lab, 3 proctored cases. Annual recertification. On-line certification module for support staff.',
          },
        ],
        defaultNext: 'pma_human_factors',
      },

      {
        id: 'pma_human_factors',
        section: 'Labeling & Human Factors',
        question:
          'Describe the human factors / usability engineering process per FDA guidance and IEC 62366.',
        guidance:
          'Per FDA Guidance "Applying Human Factors and Usability Engineering to Medical Devices" (2016) and IEC 62366-1:2015, human factors engineering must be integrated into the device design process. A use-related risk analysis (uFMEA) identifies critical tasks and potential use errors. Formative usability studies (simulated use) evaluate the user interface during design. A summative (validation) human factors study must demonstrate that the device can be used safely and effectively by the intended users in the intended use environment. For Class III devices, FDA typically expects a formal summative study with representative participants.',
        fields: [
          {
            id: 'human_factors_study_conducted',
            label: 'Human Factors Validation Study Conducted',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA HF Guidance (2016) and IEC 62366-1, a summative usability validation study is expected for Class III devices.',
          },
          {
            id: 'use_related_risk_analysis',
            label: 'Use-Related Risk Analysis (uFMEA) Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per IEC 62366-1 and FDA guidance, a use-related FMEA identifies critical tasks, potential use errors, and their consequences.',
          },
          {
            id: 'critical_tasks_identified',
            label: 'Number of Critical Tasks Identified',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Critical tasks are those where a use error could directly cause harm to the patient or user.',
          },
          {
            id: 'formative_studies_summary',
            label: 'Formative Studies Summary',
            type: 'textarea',
            placeholder: 'e.g., Three rounds of formative evaluation with interventional cardiologists (n=8 per round). Evaluated device preparation, deployment, and retrieval tasks. Design modifications made after each round.',
          },
          {
            id: 'summative_study_details',
            label: 'Summative Study Details',
            type: 'textarea',
            visibleWhen: { field: 'human_factors_study_conducted', operator: 'eq', value: true },
            placeholder: 'e.g., Summative HF validation with 15 interventional cardiologists across 3 experience levels. All 12 critical tasks completed successfully. No use errors resulting in potential harm. Two close calls identified with mitigation in labeling.',
            validation: { minLength: 50 },
          },
          {
            id: 'user_populations',
            label: 'Intended User Populations',
            type: 'multi_select',
            options: [
              { value: 'physicians', label: 'Physicians / Surgeons' },
              { value: 'nurses', label: 'Nurses / Clinical Staff' },
              { value: 'technicians', label: 'Technicians / Engineers' },
              { value: 'patients', label: 'Patients (home use)' },
              { value: 'caregivers', label: 'Lay Caregivers' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_human_factors_study',
            condition: { field: 'human_factors_study_conducted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Human Factors Validation Study',
            message:
              'Per FDA Guidance "Applying Human Factors and Usability Engineering to Medical Devices" (2016), a summative human factors validation study is expected for Class III devices. Without this study, FDA cannot assess whether the device can be used safely and effectively by the intended users. This may result in a major deficiency finding.',
            reference: 'FDA Guidance: Applying Human Factors and Usability Engineering to Medical Devices (2016); IEC 62366-1:2015',
          },
        ],
        defaultNext: 'pma_risk_management',
      },

      /* ================================================================ */
      /*  Section 8 — Post-Market Surveillance                             */
      /* ================================================================ */

      {
        id: 'pma_risk_management',
        section: 'Post-Market Surveillance',
        question:
          'Describe the risk management process per ISO 14971 and the overall risk-benefit determination.',
        guidance:
          'Per ISO 14971:2019 and 21 CFR 820.30(g), a comprehensive risk management process must span the entire device lifecycle. The risk management file must include: risk management plan, hazard identification and risk analysis (FMEA per IEC 60812, FTA per IEC 61025), risk evaluation against acceptability criteria, risk control measures, and residual risk assessment. The overall residual risk per ISO 14971 Clause 7 must be evaluated in context of the device\'s clinical benefits. The post-market phase extends risk management with complaint data, MDR reports, and periodic risk reassessment.',
        fields: [
          {
            id: 'risk_management_file_complete',
            label: 'ISO 14971 Risk Management File Complete',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'fmea_complete',
            label: 'FMEA (Failure Mode and Effects Analysis) Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per IEC 60812, FMEA should cover design FMEA, process FMEA, and use-related FMEA.',
          },
          {
            id: 'risk_control_measures',
            label: 'Risk Control Measures Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Design controls: self-sealing delivery sheath reduces vascular complications. Protective measures: deployment indicators prevent maldeployment. Information for safety: IFU warnings for anticoagulation management.',
          },
          {
            id: 'residual_risk_acceptable',
            label: 'Overall Residual Risk Acceptable per ISO 14971',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 Clause 7, the overall residual risk must be acceptable when weighed against the clinical benefits.',
          },
          {
            id: 'identified_risks_count',
            label: 'Number of Identified Risks',
            type: 'number',
            validation: { min: 0 },
          },
        ],
        defaultNext: 'pma_post_approval_study',
      },

      {
        id: 'pma_post_approval_study',
        section: 'Post-Market Surveillance',
        question:
          'Has a post-approval study (PAS) plan been developed? Describe the design, enrollment, and endpoints.',
        guidance:
          'Per 21 CFR 814.82 and FDA Guidance "Post-Approval Studies" (2016), FDA may require post-approval studies as a condition of PMA approval. PAS requirements are common for novel Class III devices to gather additional long-term safety and effectiveness data. The PAS plan should be discussed with FDA during the pre-submission process. Typical PAS designs include prospective registries with extended follow-up (5-10 years for permanent implants), randomized controlled post-market studies, or real-world evidence collection.',
        fields: [
          {
            id: 'pas_plan_developed',
            label: 'Post-Approval Study Plan Developed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pas_design',
            label: 'PAS Study Design',
            type: 'textarea',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            placeholder: 'e.g., Prospective multi-center single-arm registry. 2000 consecutively treated patients at up to 50 U.S. sites. Annual follow-up through 10 years.',
          },
          {
            id: 'pas_enrollment_target',
            label: 'PAS Enrollment Target',
            type: 'number',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'pas_endpoints',
            label: 'PAS Endpoints',
            type: 'textarea',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            placeholder: 'e.g., Primary: All-cause mortality at 5 years. Secondary: Structural valve deterioration, rehospitalization, pacemaker rate, patient-reported outcomes.',
          },
          {
            id: 'pas_duration_years',
            label: 'PAS Duration (years)',
            type: 'number',
            visibleWhen: { field: 'pas_plan_developed', operator: 'eq', value: true },
            validation: { min: 1, max: 20 },
            helpText: 'For permanent implants, FDA typically requires 5-10 years of post-market follow-up.',
          },
        ],
        issueChecks: [
          {
            id: 'no_post_market_surveillance_plan',
            condition: { field: 'pas_plan_developed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Post-Market Surveillance Plan',
            message:
              'FDA commonly requires post-approval studies (PAS) as a condition of PMA approval per 21 CFR 814.82, particularly for novel Class III devices. Developing a proactive PAS plan demonstrates commitment to long-term safety monitoring and may facilitate the approval process. Discuss PAS expectations with FDA during pre-submission interactions.',
            reference: '21 CFR 814.82; FDA Guidance: Post-Approval Studies (2016)',
          },
        ],
        defaultNext: 'pma_post_market_plan',
      },

      {
        id: 'pma_post_market_plan',
        section: 'Post-Market Surveillance',
        question:
          'Describe the post-market surveillance infrastructure, including MDR reporting, complaints handling, annual reports, and pre-submission history with FDA.',
        guidance:
          'Per 21 CFR 803, manufacturers must report device-related deaths (30 days, or 5 days for remedial action events), serious injuries (30 days), and malfunctions (30 days). Annual reports per 21 CFR 814.84 must summarize device performance, AEs, distribution, and changes. Complaints handling per 21 CFR 820.198 must be established before distribution. Pre-submission interactions per FDA Q-Submission Guidance (2023) are strongly recommended to align on study design, testing, and PMA content expectations. Device tracking per 21 CFR 821 may be required for life-sustaining or life-supporting devices.',
        fields: [
          {
            id: 'mdr_reporting_plan',
            label: 'MDR Reporting Plan (21 CFR 803)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'complaints_handling',
            label: 'Complaints Handling Process',
            type: 'select',
            required: true,
            options: [
              { value: 'established', label: 'Established and documented per 21 CFR 820.198' },
              { value: 'in_development', label: 'In development' },
              { value: 'not_started', label: 'Not yet started' },
            ],
          },
          {
            id: 'annual_report_plan',
            label: 'Annual Report Plan (21 CFR 814.84)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'device_tracking_required',
            label: 'Device Tracking Required (21 CFR 821)',
            type: 'yes_no',
            helpText: 'Per 21 CFR 821, device tracking is required for devices whose failure would be reasonably likely to have serious adverse health consequences, or that are permanently implanted, life-sustaining, or life-supporting.',
          },
          {
            id: 'qsub_meeting_held',
            label: 'Pre-Submission (Q-Sub) Meeting with FDA',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA Q-Submission Guidance (2023), pre-sub meetings are strongly recommended for novel Class III devices.',
          },
          {
            id: 'qsub_feedback_summary',
            label: 'FDA Pre-Submission Feedback Summary',
            type: 'textarea',
            visibleWhen: { field: 'qsub_meeting_held', operator: 'eq', value: true },
            placeholder: 'e.g., FDA agreed with study design, recommended minimum 12-month follow-up, requested additional fatigue testing, and indicated advisory panel review is likely.',
          },
          {
            id: 'target_submission_date',
            label: 'Target PMA Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'advisory_panel_expected',
            label: 'Advisory Panel Meeting Expected',
            type: 'yes_no',
            helpText: 'Per 21 CFR 814.44 and FD&C Act Section 515(c)(3), advisory panel review is common for novel Class III devices.',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
