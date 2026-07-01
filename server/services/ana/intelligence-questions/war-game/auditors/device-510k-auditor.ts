/**
 * 510(k) Device War Game Auditor
 *
 * Simulates FDA CDRH reviewer scrutiny of a 510(k) premarket notification.
 * Examines predicate device selection, substantial equivalence, software
 * documentation, biocompatibility, performance testing, risk management,
 * and labeling compliance.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/device-510k-auditor
 */
import type { WarGameAuditor, AuditRule, WarGameFinding } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function includes(val: unknown, search: string): boolean {
  if (typeof val === 'string') return val.toLowerCase().includes(search.toLowerCase());
  if (Array.isArray(val)) return val.includes(search);
  return false;
}

/* ------------------------------------------------------------------ */
/*  Rules                                                             */
/* ------------------------------------------------------------------ */

function buildRules(): AuditRule[] {
  return [
    /* ── Predicate Device & SE Demonstration (1-7) ─────────────── */
    {
      id: 'dev_001',
      dimension: 'completeness',
      title: 'No predicate device identified',
      question:
        'How can you demonstrate substantial equivalence without identifying a predicate device?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.predicate_device)) {
          return {
            id: 'dev_001',
            dimension: 'completeness',
            severity: 'critical',
            title: 'No predicate device identified',
            question:
              'How can you demonstrate substantial equivalence without identifying a predicate device?',
            observation:
              'No predicate device has been identified in the submission.',
            requirement:
              'A 510(k) submission must identify a legally marketed predicate device to establish substantial equivalence.',
            reference: '21 CFR 807.87(f)',
            recommendation:
              'Identify and document a legally marketed predicate device with the same intended use and similar technological characteristics.',
            relatedFields: ['predicate_device', 'predicate_510k_number'],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_002',
      dimension: 'regulatory_alignment',
      title: 'No predicate 510(k) number',
      question:
        'Without a predicate 510(k) number, how can FDA verify that the predicate device is legally marketed?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.predicate_510k_number)) {
          return {
            id: 'dev_002',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'No predicate 510(k) number',
            question:
              'Without a predicate 510(k) number, how can FDA verify that the predicate device is legally marketed?',
            observation:
              'The predicate 510(k) number has not been provided.',
            requirement:
              'The submission must include the 510(k) number of the predicate device to confirm its marketing status.',
            reference: '21 CFR 807.92(a)(3)',
            recommendation:
              'Provide the predicate device 510(k) clearance number (e.g., K123456) and verify it in the FDA 510(k) database.',
            relatedFields: ['predicate_510k_number', 'predicate_device'],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_003',
      dimension: 'scientific_rigor',
      title: 'Substantial equivalence summary inadequate',
      question:
        'How does a brief SE summary adequately demonstrate that the device is as safe and effective as the predicate?',
      check(answers): WarGameFinding | null {
        const summary = answers.substantial_equivalence_summary;
        if (
          typeof summary === 'string' &&
          summary.trim().length > 0 &&
          summary.trim().length < 100
        ) {
          return {
            id: 'dev_003',
            dimension: 'scientific_rigor',
            severity: 'warning',
            title: 'Substantial equivalence summary inadequate',
            question:
              'How does a brief SE summary adequately demonstrate that the device is as safe and effective as the predicate?',
            observation:
              'The substantial equivalence summary is too short to adequately justify equivalence.',
            requirement:
              'The SE summary must provide a detailed comparison of intended use, technological characteristics, and performance data.',
            reference: '21 CFR 807.92',
            recommendation:
              'Expand the SE summary to include a thorough comparison of intended use, technological characteristics, and performance data between the subject and predicate devices.',
            relatedFields: [
              'substantial_equivalence_summary',
              'predicate_device',
              'comparison_table_complete',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_004',
      dimension: 'consistency',
      title: 'Intended use differs from predicate without comparison',
      question:
        'If the intended use is defined but no comparison table is provided, how can FDA assess equivalence?',
      check(answers): WarGameFinding | null {
        if (!isEmpty(answers.intended_use) && !answers.comparison_table_complete) {
          return {
            id: 'dev_004',
            dimension: 'consistency',
            severity: 'warning',
            title: 'Intended use differs from predicate without comparison',
            question:
              'If the intended use is defined but no comparison table is provided, how can FDA assess equivalence?',
            observation:
              'An intended use is stated but the comparison table with the predicate device is not complete.',
            requirement:
              'A side-by-side comparison table must demonstrate how the intended use and technological characteristics compare to the predicate.',
            reference: 'FDA SE Guidance (2014)',
            recommendation:
              'Complete the comparison table showing intended use, technological characteristics, and performance data side-by-side with the predicate device.',
            relatedFields: [
              'intended_use',
              'comparison_table_complete',
              'predicate_device',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_005',
      dimension: 'completeness',
      title: 'Device description too brief',
      question:
        'How can FDA evaluate your device with an insufficient description of its design and characteristics?',
      check(answers): WarGameFinding | null {
        const desc = answers.device_description;
        if (
          typeof desc === 'string' &&
          desc.trim().length > 0 &&
          desc.trim().length < 50
        ) {
          return {
            id: 'dev_005',
            dimension: 'completeness',
            severity: 'warning',
            title: 'Device description too brief',
            question:
              'How can FDA evaluate your device with an insufficient description of its design and characteristics?',
            observation:
              'The device description is too brief to allow meaningful review.',
            requirement:
              'The device description must include design, materials, principles of operation, and key technical specifications.',
            reference: '21 CFR 807.87(e)',
            recommendation:
              'Provide a comprehensive device description covering design, materials, dimensions, principles of operation, and key specifications.',
            relatedFields: ['device_description', 'device_name'],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_006',
      dimension: 'regulatory_alignment',
      title: 'Comparison table not complete',
      question:
        'Without a complete comparison table, how will FDA assess whether differences from the predicate raise new safety or effectiveness questions?',
      check(answers): WarGameFinding | null {
        if (!answers.comparison_table_complete) {
          return {
            id: 'dev_006',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'Comparison table not complete',
            question:
              'Without a complete comparison table, how will FDA assess whether differences from the predicate raise new safety or effectiveness questions?',
            observation:
              'The comparison table between the subject and predicate device is incomplete or missing.',
            requirement:
              'A complete comparison table is required to demonstrate substantial equivalence.',
            reference: 'FDA Guidance on Content of 510(k) (2023)',
            recommendation:
              'Complete the comparison table addressing intended use, device design, materials, energy type, performance specifications, and other relevant characteristics.',
            relatedFields: [
              'comparison_table_complete',
              'predicate_device',
              'technological_characteristics',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_007',
      dimension: 'completeness',
      title: 'Indications for use not specified',
      question:
        'How can the review proceed without a clear statement of indications for use?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.indications_for_use)) {
          return {
            id: 'dev_007',
            dimension: 'completeness',
            severity: 'critical',
            title: 'Indications for use not specified',
            question:
              'How can the review proceed without a clear statement of indications for use?',
            observation: 'No indications for use have been provided.',
            requirement:
              'The 510(k) must include a clear, concise statement of indications for use consistent with the predicate device.',
            reference: '21 CFR 807.87(e)',
            recommendation:
              'Draft a clear indications for use statement and ensure it is consistent with or narrower than the predicate device indications.',
            relatedFields: ['indications_for_use', 'intended_use'],
          };
        }
        return null;
      },
    },

    /* ── Software & Cybersecurity (8-12) ────────────────────────── */
    {
      id: 'dev_008',
      dimension: 'regulatory_alignment',
      title: 'Software level of concern not classified',
      question:
        'Your device contains software but you have not classified the level of concern. FDA requires this classification for all software-containing devices.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.software_level_of_concern)) {
          return {
            id: 'dev_008',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'Software level of concern not classified',
            question:
              'Your device contains software but you have not classified the level of concern. FDA requires this classification for all software-containing devices.',
            observation:
              'Software level of concern has not been classified (Minor, Moderate, or Major).',
            requirement:
              'FDA requires software-containing devices to classify the level of concern to determine the appropriate documentation level.',
            reference: 'FDA Software Guidance (2005)',
            recommendation:
              'Classify the software level of concern as Minor, Moderate, or Major based on the severity of harm that could result from software failure.',
            relatedFields: [
              'software_level_of_concern',
              'software_documentation',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_009',
      dimension: 'documentation',
      title: 'Software documentation incomplete',
      question:
        'Without complete software documentation, how can FDA assess that the software was developed and validated according to recognized standards?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.software_documentation)) {
          return {
            id: 'dev_009',
            dimension: 'documentation',
            severity: 'warning',
            title: 'Software documentation incomplete',
            question:
              'Without complete software documentation, how can FDA assess that the software was developed and validated according to recognized standards?',
            observation:
              'Software documentation is missing or incomplete.',
            requirement:
              'Software documentation must include requirements, architecture, design, testing, and validation per the level of concern.',
            reference: 'FDA Software Validation Guidance, IEC 62304',
            recommendation:
              'Provide software documentation including software requirements specification, architecture design, risk analysis, verification and validation testing, and revision history.',
            relatedFields: [
              'software_documentation',
              'software_level_of_concern',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_010',
      dimension: 'risk_identification',
      title: 'No cybersecurity assessment',
      question:
        'FDA requires premarket cybersecurity documentation for connected devices. How will you address this requirement?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.cybersecurity_assessment)) {
          return {
            id: 'dev_010',
            dimension: 'risk_identification',
            severity: 'warning',
            title: 'No cybersecurity assessment',
            question:
              'FDA requires premarket cybersecurity documentation for connected devices. How will you address this requirement?',
            observation:
              'No cybersecurity assessment has been provided for the device.',
            requirement:
              'Devices with network connectivity or data exchange capabilities must include a cybersecurity risk assessment and mitigation plan.',
            reference: 'FDA Cybersecurity Guidance (2023)',
            recommendation:
              'Conduct and document a cybersecurity risk assessment including threat modeling, security architecture, vulnerability testing, and a software bill of materials (SBOM).',
            relatedFields: [
              'cybersecurity_assessment',
              'software_level_of_concern',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_011',
      dimension: 'completeness',
      title: 'Software device without human factors study',
      question:
        'For a device with software, how will you demonstrate that the user interface does not introduce use-related risks?',
      check(answers): WarGameFinding | null {
        if (
          !isEmpty(answers.software_level_of_concern) &&
          isEmpty(answers.human_factors_study)
        ) {
          return {
            id: 'dev_011',
            dimension: 'completeness',
            severity: 'warning',
            title: 'Software device without human factors study',
            question:
              'For a device with software, how will you demonstrate that the user interface does not introduce use-related risks?',
            observation:
              'The device contains software but no human factors study has been provided.',
            requirement:
              'FDA expects human factors testing for software-driven devices to demonstrate safe and effective use.',
            reference: 'FDA Human Factors Guidance (2016)',
            recommendation:
              'Conduct a human factors validation study including formative and summative usability testing with representative users.',
            relatedFields: [
              'human_factors_study',
              'software_level_of_concern',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_012',
      dimension: 'consistency',
      title: 'High software concern without clinical data',
      question:
        'A major level of concern classification implies potential for serious harm. How can you justify the absence of clinical data?',
      check(answers): WarGameFinding | null {
        if (
          includes(answers.software_level_of_concern, 'major') &&
          isEmpty(answers.clinical_data)
        ) {
          return {
            id: 'dev_012',
            dimension: 'consistency',
            severity: 'critical',
            title: 'High software concern without clinical data',
            question:
              'A major level of concern classification implies potential for serious harm. How can you justify the absence of clinical data?',
            observation:
              'Software is classified as major level of concern but no clinical data has been provided.',
            requirement:
              'Major level of concern software typically requires clinical evidence to demonstrate safety and effectiveness.',
            reference: 'FDA Software Guidance Section 6',
            recommendation:
              'Provide clinical data or a well-justified rationale for why clinical data is not necessary despite the major level of concern classification.',
            relatedFields: [
              'software_level_of_concern',
              'clinical_data',
              'performance_testing_summary',
            ],
          };
        }
        return null;
      },
    },

    /* ── Biocompatibility & Materials (13-17) ───────────────────── */
    {
      id: 'dev_013',
      dimension: 'scientific_rigor',
      title: 'No biocompatibility evaluation',
      question:
        'For a device with patient contact, how will you demonstrate biocompatibility without an evaluation?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.biocompatibility_evaluation)) {
          return {
            id: 'dev_013',
            dimension: 'scientific_rigor',
            severity: 'critical',
            title: 'No biocompatibility evaluation',
            question:
              'For a device with patient contact, how will you demonstrate biocompatibility without an evaluation?',
            observation:
              'No biocompatibility evaluation has been provided.',
            requirement:
              'Devices with direct or indirect patient contact must undergo biocompatibility testing per ISO 10993-1.',
            reference: 'ISO 10993-1, FDA Biocompatibility Guidance (2020)',
            recommendation:
              'Conduct a biocompatibility evaluation based on ISO 10993-1, considering the nature and duration of patient contact, and document endpoint testing results.',
            relatedFields: [
              'biocompatibility_evaluation',
              'biocompatibility_standard',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_014',
      dimension: 'regulatory_alignment',
      title: 'Biocompatibility not per ISO 10993',
      question:
        'Has the biocompatibility evaluation been conducted in accordance with the recognized consensus standard ISO 10993?',
      check(answers): WarGameFinding | null {
        if (
          !isEmpty(answers.biocompatibility_evaluation) &&
          (isEmpty(answers.biocompatibility_standard) ||
            !includes(answers.biocompatibility_standard, '10993'))
        ) {
          return {
            id: 'dev_014',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'Biocompatibility not per ISO 10993',
            question:
              'Has the biocompatibility evaluation been conducted in accordance with the recognized consensus standard ISO 10993?',
            observation:
              'The biocompatibility standard referenced does not appear to include ISO 10993.',
            requirement:
              'Biocompatibility evaluations should follow ISO 10993-1:2018 and applicable parts for the specific device contact type.',
            reference: 'ISO 10993-1:2018',
            recommendation:
              'Ensure the biocompatibility evaluation references ISO 10993-1:2018 and addresses the applicable biological endpoints for the device contact type and duration.',
            relatedFields: [
              'biocompatibility_standard',
              'biocompatibility_evaluation',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_015',
      dimension: 'completeness',
      title: 'No sterilization validation',
      question:
        'The device requires sterilization, but validation data has not been provided. How can you demonstrate sterility assurance?',
      check(answers): WarGameFinding | null {
        if (
          !isEmpty(answers.sterilization_method) &&
          isEmpty(answers.sterilization_validation)
        ) {
          return {
            id: 'dev_015',
            dimension: 'completeness',
            severity: 'critical',
            title: 'No sterilization validation',
            question:
              'The device requires sterilization, but validation data has not been provided. How can you demonstrate sterility assurance?',
            observation:
              'A sterilization method is specified but sterilization validation data is missing.',
            requirement:
              'Sterilization processes must be validated to demonstrate consistent achievement of the required sterility assurance level.',
            reference: '21 CFR 820.75',
            recommendation:
              'Provide sterilization validation data including bioburden testing, dose/cycle establishment, and sterility assurance level (SAL) demonstration.',
            relatedFields: [
              'sterilization_validation',
              'sterilization_method',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_016',
      dimension: 'documentation',
      title: 'No shelf life data',
      question:
        'Without shelf life testing, how can you assure the device remains safe and effective throughout its labeled life?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.shelf_life)) {
          return {
            id: 'dev_016',
            dimension: 'documentation',
            severity: 'warning',
            title: 'No shelf life data',
            question:
              'Without shelf life testing, how can you assure the device remains safe and effective throughout its labeled life?',
            observation:
              'No shelf life data or testing has been provided.',
            requirement:
              'Shelf life testing should demonstrate the device maintains its performance characteristics over the claimed shelf life period.',
            reference: 'FDA Shelf Life Guidance',
            recommendation:
              'Conduct real-time or accelerated aging studies per ASTM F1980 to establish and validate the device shelf life.',
            relatedFields: ['shelf_life', 'packaging_validation'],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_017',
      dimension: 'completeness',
      title: 'No packaging validation',
      question:
        'How will you demonstrate that the packaging maintains sterile barrier integrity throughout distribution and storage?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.packaging_validation)) {
          return {
            id: 'dev_017',
            dimension: 'completeness',
            severity: 'warning',
            title: 'No packaging validation',
            question:
              'How will you demonstrate that the packaging maintains sterile barrier integrity throughout distribution and storage?',
            observation:
              'No packaging validation data has been provided.',
            requirement:
              'Packaging validation must demonstrate the sterile barrier system maintains integrity through distribution, storage, and handling.',
            reference: 'ISO 11607, ASTM F2095',
            recommendation:
              'Provide packaging validation data including seal strength, distribution simulation, and accelerated aging per ISO 11607 and ASTM F2095.',
            relatedFields: ['packaging_validation', 'shelf_life'],
          };
        }
        return null;
      },
    },

    /* ── Performance Testing (18-22) ────────────────────────────── */
    {
      id: 'dev_018',
      dimension: 'scientific_rigor',
      title: 'No performance testing summary',
      question:
        'Without a performance testing summary, how can FDA evaluate whether the device performs as intended?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.performance_testing_summary)) {
          return {
            id: 'dev_018',
            dimension: 'scientific_rigor',
            severity: 'critical',
            title: 'No performance testing summary',
            question:
              'Without a performance testing summary, how can FDA evaluate whether the device performs as intended?',
            observation:
              'No performance testing summary has been provided.',
            requirement:
              'Performance testing data must demonstrate the device meets its design specifications and performs equivalently to the predicate.',
            reference: 'FDA 510(k) Guidance',
            recommendation:
              'Provide a comprehensive performance testing summary including test methods, acceptance criteria, sample sizes, and results for all critical performance characteristics.',
            relatedFields: [
              'performance_testing_summary',
              'bench_testing',
              'clinical_data',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_019',
      dimension: 'completeness',
      title: 'No bench testing data',
      question:
        'Bench testing is fundamental to demonstrating device performance. Why has no bench testing data been included?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.bench_testing)) {
          return {
            id: 'dev_019',
            dimension: 'completeness',
            severity: 'warning',
            title: 'No bench testing data',
            question:
              'Bench testing is fundamental to demonstrating device performance. Why has no bench testing data been included?',
            observation: 'No bench testing data has been provided.',
            requirement:
              'Bench testing data should demonstrate the device meets design specifications and applicable performance standards.',
            reference: '21 CFR 807.87(g)',
            recommendation:
              'Conduct and document bench testing covering mechanical, electrical, and functional performance characteristics relevant to the device type.',
            relatedFields: [
              'bench_testing',
              'performance_testing_summary',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_020',
      dimension: 'risk_identification',
      title: 'No clinical data for high-risk device',
      question:
        'For a Class III or high-risk device, clinical data is typically expected. How do you justify its absence?',
      check(answers): WarGameFinding | null {
        if (
          includes(answers.device_class, 'class_iii') &&
          isEmpty(answers.clinical_data)
        ) {
          return {
            id: 'dev_020',
            dimension: 'risk_identification',
            severity: 'critical',
            title: 'No clinical data for high-risk device',
            question:
              'For a Class III or high-risk device, clinical data is typically expected. How do you justify its absence?',
            observation:
              'The device is classified as Class III but no clinical data has been provided.',
            requirement:
              'Class III devices generally require clinical data to demonstrate safety and effectiveness.',
            reference: '21 CFR 807.87(h)',
            recommendation:
              'Provide clinical data from well-controlled studies or justify why clinical data is not necessary based on existing literature and bench testing.',
            relatedFields: [
              'clinical_data',
              'device_class',
              'performance_testing_summary',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_021',
      dimension: 'practical_feasibility',
      title: 'No animal testing justification',
      question:
        'If animal testing was not conducted, is there a justification for alternative testing methods?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.animal_testing)) {
          return {
            id: 'dev_021',
            dimension: 'practical_feasibility',
            severity: 'info',
            title: 'No animal testing justification',
            question:
              'If animal testing was not conducted, is there a justification for alternative testing methods?',
            observation:
              'No animal testing data or justification for alternatives has been provided.',
            requirement:
              'If animal testing was not conducted, alternative testing methods should be justified per FDA guidance on alternatives.',
            reference: 'FDA Alternatives to Animal Testing',
            recommendation:
              'Provide a justification for why animal testing was not conducted and describe the alternative methods used to evaluate device safety.',
            relatedFields: [
              'animal_testing',
              'bench_testing',
              'clinical_data',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_022',
      dimension: 'regulatory_alignment',
      title: 'No EMC/EMR testing',
      question:
        'Without electromagnetic compatibility testing, how can you demonstrate the device does not interfere with or is not affected by other devices?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.emr_emc_testing)) {
          return {
            id: 'dev_022',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'No EMC/EMR testing',
            question:
              'Without electromagnetic compatibility testing, how can you demonstrate the device does not interfere with or is not affected by other devices?',
            observation:
              'No electromagnetic compatibility (EMC/EMR) testing has been provided.',
            requirement:
              'Electrical medical devices must demonstrate electromagnetic compatibility per IEC 60601-1-2.',
            reference: 'IEC 60601-1-2',
            recommendation:
              'Conduct EMC testing per IEC 60601-1-2 including emissions and immunity testing, and provide the full test report.',
            relatedFields: [
              'emr_emc_testing',
              'electrical_safety_testing',
            ],
          };
        }
        return null;
      },
    },

    /* ── Risk Management & Labeling (23-28) ─────────────────────── */
    {
      id: 'dev_023',
      dimension: 'risk_identification',
      title: 'Risk analysis incomplete',
      question:
        'An incomplete risk analysis suggests not all hazards have been identified and mitigated. What hazards remain unaddressed?',
      check(answers): WarGameFinding | null {
        if (answers.risk_analysis_complete === false) {
          return {
            id: 'dev_023',
            dimension: 'risk_identification',
            severity: 'critical',
            title: 'Risk analysis incomplete',
            question:
              'An incomplete risk analysis suggests not all hazards have been identified and mitigated. What hazards remain unaddressed?',
            observation:
              'The risk analysis has been marked as incomplete.',
            requirement:
              'A complete risk analysis per ISO 14971 must identify all foreseeable hazards, estimate risks, and document risk control measures.',
            reference: 'ISO 14971:2019',
            recommendation:
              'Complete the risk analysis including hazard identification, risk estimation, risk evaluation, risk control measures, and overall residual risk evaluation per ISO 14971:2019.',
            relatedFields: [
              'risk_analysis_complete',
              'risk_analysis_method',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_024',
      dimension: 'documentation',
      title: 'Risk analysis method not specified',
      question:
        'Without specifying the risk analysis method, how can FDA evaluate the rigor and completeness of your risk management process?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.risk_analysis_method)) {
          return {
            id: 'dev_024',
            dimension: 'documentation',
            severity: 'warning',
            title: 'Risk analysis method not specified',
            question:
              'Without specifying the risk analysis method, how can FDA evaluate the rigor and completeness of your risk management process?',
            observation:
              'The risk analysis method (e.g., FMEA, FTA, HAZOP) has not been specified.',
            requirement:
              'The risk management file must specify the method used for hazard identification and risk analysis.',
            reference: 'ISO 14971, 21 CFR 820.30(g)',
            recommendation:
              'Specify the risk analysis method used (e.g., FMEA, FTA, HAZOP) and ensure it is applied systematically throughout the risk management process.',
            relatedFields: [
              'risk_analysis_method',
              'risk_analysis_complete',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_025',
      dimension: 'regulatory_alignment',
      title: 'Labeling not compliant with 21 CFR 801',
      question:
        'Has the labeling been reviewed for compliance with 21 CFR 801 requirements?',
      check(answers): WarGameFinding | null {
        if (!answers.labeling_compliance_801) {
          return {
            id: 'dev_025',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'Labeling not compliant with 21 CFR 801',
            question:
              'Has the labeling been reviewed for compliance with 21 CFR 801 requirements?',
            observation:
              'Labeling compliance with 21 CFR 801 has not been confirmed.',
            requirement:
              'Device labeling must comply with 21 CFR 801, including adequate directions for use, warnings, and contraindications.',
            reference: '21 CFR 801',
            recommendation:
              'Review all labeling materials against 21 CFR 801 requirements and document compliance with each applicable section.',
            relatedFields: [
              'labeling_compliance_801',
              'labeling_draft',
              'indications_for_use',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_026',
      dimension: 'completeness',
      title: 'No labeling draft provided',
      question:
        'Without a labeling draft, how can FDA evaluate whether the proposed labeling is adequate and compliant?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.labeling_draft)) {
          return {
            id: 'dev_026',
            dimension: 'completeness',
            severity: 'warning',
            title: 'No labeling draft provided',
            question:
              'Without a labeling draft, how can FDA evaluate whether the proposed labeling is adequate and compliant?',
            observation:
              'No draft labeling has been provided for review.',
            requirement:
              'A 510(k) submission must include proposed labeling, including the package label, instructions for use, and any promotional materials.',
            reference: '21 CFR 807.87(e)',
            recommendation:
              'Provide draft labeling including the device label, instructions for use (IFU), and any patient-facing materials.',
            relatedFields: [
              'labeling_draft',
              'labeling_compliance_801',
              'indications_for_use',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_027',
      dimension: 'regulatory_alignment',
      title: 'UDI status not addressed',
      question:
        'Unique Device Identification is required for most medical devices. Has UDI compliance been addressed?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.udi_status)) {
          return {
            id: 'dev_027',
            dimension: 'regulatory_alignment',
            severity: 'warning',
            title: 'UDI status not addressed',
            question:
              'Unique Device Identification is required for most medical devices. Has UDI compliance been addressed?',
            observation:
              'UDI compliance status has not been addressed in the submission.',
            requirement:
              'Most medical devices are required to bear a UDI on their label and packages, and manufacturers must submit device information to the GUDID.',
            reference: '21 CFR 830',
            recommendation:
              'Address UDI requirements, including obtaining a UDI from an FDA-accredited issuing agency and submitting device data to the GUDID.',
            relatedFields: ['udi_status', 'labeling_draft'],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_028',
      dimension: 'risk_identification',
      title: 'No MRI safety evaluation',
      question:
        'Has the device been evaluated for MRI safety? Patients with implanted or body-contact devices may undergo MRI procedures.',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.mri_safety_evaluation)) {
          return {
            id: 'dev_028',
            dimension: 'risk_identification',
            severity: 'info',
            title: 'No MRI safety evaluation',
            question:
              'Has the device been evaluated for MRI safety? Patients with implanted or body-contact devices may undergo MRI procedures.',
            observation:
              'No MRI safety evaluation has been provided.',
            requirement:
              'Devices that may be used in or near MRI environments should be evaluated for MRI safety and labeled accordingly.',
            reference: 'ASTM F2503',
            recommendation:
              'Evaluate MRI safety per ASTM F2503 and classify the device as MR Safe, MR Conditional, or MR Unsafe. Include appropriate MRI labeling.',
            relatedFields: [
              'mri_safety_evaluation',
              'labeling_draft',
              'risk_analysis_complete',
            ],
          };
        }
        return null;
      },
    },

    /* ── Compliance & Special Controls (29-30) ──────────────────── */
    {
      id: 'dev_029',
      dimension: 'regulatory_alignment',
      title: 'Special controls not addressed',
      question:
        'For a Class II device, special controls are required. Have all applicable special controls been identified and addressed?',
      check(answers): WarGameFinding | null {
        if (
          includes(answers.device_class, 'class_ii') &&
          isEmpty(answers.special_controls_addressed)
        ) {
          return {
            id: 'dev_029',
            dimension: 'regulatory_alignment',
            severity: 'critical',
            title: 'Special controls not addressed',
            question:
              'For a Class II device, special controls are required. Have all applicable special controls been identified and addressed?',
            observation:
              'The device is Class II but special controls have not been addressed.',
            requirement:
              'Class II devices must comply with applicable special controls, which may include performance standards, postmarket surveillance, and patient registries.',
            reference: '21 CFR 860.24',
            recommendation:
              'Identify all applicable special controls for the device product code and document how each control has been addressed in the submission.',
            relatedFields: [
              'special_controls_addressed',
              'device_class',
              'product_code',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'dev_030',
      dimension: 'documentation',
      title: 'No electrical safety testing',
      question:
        'For an electrically powered device, how can safety be assured without IEC 60601-1 testing?',
      check(answers): WarGameFinding | null {
        if (isEmpty(answers.electrical_safety_testing)) {
          return {
            id: 'dev_030',
            dimension: 'documentation',
            severity: 'warning',
            title: 'No electrical safety testing',
            question:
              'For an electrically powered device, how can safety be assured without IEC 60601-1 testing?',
            observation:
              'No electrical safety testing data per IEC 60601-1 has been provided.',
            requirement:
              'Electrically powered medical devices must demonstrate compliance with IEC 60601-1 for basic safety and essential performance.',
            reference: 'IEC 60601-1',
            recommendation:
              'Conduct electrical safety testing per IEC 60601-1 and provide the test report, including results for protection against electrical hazards, mechanical hazards, and excessive temperatures.',
            relatedFields: [
              'electrical_safety_testing',
              'emr_emc_testing',
            ],
          };
        }
        return null;
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createDevice510kAuditor(): WarGameAuditor {
  return {
    category: '510k',
    name: '510(k) Premarket Notification Auditor',
    description:
      'Simulates FDA CDRH reviewer scrutiny of a 510(k) premarket notification, examining predicate device selection, substantial equivalence, software documentation, biocompatibility, performance testing, risk management, and labeling compliance.',
    rules: buildRules(),
  };
}
