/**
 * Seed CMC RTF trigger patterns. These cover the chemistry/manufacturing/
 * controls deficiencies the FDA chemistry reviewer routinely cites at
 * refuse-to-file. Each pattern anchors to the controlling regulation
 * (21 CFR 314.50, 21 CFR 314.420 for DMFs, ICH Q-series) or guidance,
 * with verbatim phrasings drawn from public RTF letters.
 *
 * Frequencies are conservative estimates from published RTF summaries;
 * refine once internal precedent records are loaded.
 */

import type { RTFTriggerPattern } from '../rtf-trigger-service';

export type CmcRtfSeed = Omit<
  RTFTriggerPattern,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt'
>;

export const CMC_RTF_PATTERNS: CmcRtfSeed[] = [
  {
    patternCode: 'CMC_DMF_LETTER_OF_AUTHORIZATION_MISSING',
    patternName: 'Drug Master File letter of authorization not on file or expired',
    category: 'cmc_data',
    triggerDescription:
      'Application references a Type II Drug Master File for the API or excipient but the DMF holder has not filed a current Letter of Authorization with FDA under 21 CFR 314.420. FDA cannot review the referenced DMF without an LOA.',
    typicalFdaLanguage: [
      'A current Letter of Authorization for DMF #XXXXX has not been filed by the DMF holder',
      'Reference to the Drug Master File cannot be accepted without an active Letter of Authorization',
    ],
    frequencyRate: 0.07,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 45,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Confirm LOA with DMF holder',
        details: 'Contact the API/excipient supplier and confirm they have submitted a current LOA naming your applicant and product.',
        timelineDays: 14,
      },
      {
        stepNumber: 2,
        action: 'Provide LOA copy in resubmission',
        details: 'Include the LOA copy in Module 1.4.1 (or the DMF reference letter section) along with the DMF number and holder details.',
        timelineDays: 7,
      },
    ],
    commonMistakes: [
      'Assuming a previously submitted LOA still covers the current applicant',
      'Submitting the LOA via the applicant instead of the DMF holder (only the holder can file)',
    ],
    submissionTypes: ['NDA', 'BLA', 'ANDA', 'IND'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_BATCH_FORMULA_INCONSISTENT',
    patternName: 'Batch formula inconsistent across Module 3 sections',
    category: 'cmc_data',
    triggerDescription:
      'Composition stated in 3.2.P.1 does not match the batch formula in 3.2.P.3.2, or unit doses do not reconcile to the bulk formula at the proposed batch size. FDA cites ICH Q6A and 21 CFR 211.103.',
    typicalFdaLanguage: [
      'The drug product composition in 3.2.P.1 is inconsistent with the batch formula in 3.2.P.3.2',
      'The unit dose composition does not reconcile to the bulk manufacturing formula',
    ],
    frequencyRate: 0.06,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 30,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Run reconciliation across 3.2.P.1, 3.2.P.3.2, 3.2.P.5.1',
        details: 'Verify per-unit and per-batch quantities for every component including overages, with the same density/strength basis throughout.',
        timelineDays: 14,
      },
      {
        stepNumber: 2,
        action: 'Submit corrected composition tables in an amendment',
        details: 'File an information amendment with the reconciled tables and a brief narrative on the source of the discrepancy.',
        timelineDays: 7,
      },
    ],
    commonMistakes: [
      'Updating one section after a formula change without propagating to all referenced sections',
      'Mixing as-is and anhydrous basis across sections without conversion notes',
    ],
    submissionTypes: ['NDA', 'BLA', 'ANDA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_DS_CHARACTERIZATION_INSUFFICIENT',
    patternName: 'Drug substance characterization incomplete (3.2.S.3.1)',
    category: 'cmc_data',
    triggerDescription:
      'Elucidation of structure and other characteristics in 3.2.S.3.1 lacks orthogonal techniques (NMR, MS, IR, elemental analysis for small molecules; primary/higher-order structure for biologics) per ICH Q6A/Q6B.',
    typicalFdaLanguage: [
      'The data provided are insufficient to confirm the structure of the drug substance per ICH Q6A',
      'Higher-order structure characterization is required per ICH Q6B for biotechnological products',
    ],
    frequencyRate: 0.05,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 90,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Complete orthogonal characterization package',
        details: 'For small molecules: NMR (1H, 13C, optionally 2D), MS, IR, elemental, optical rotation if chiral. For biologics: peptide map, intact mass, glycan profile, disulfide map, HOS by CD/DSC.',
        timelineDays: 75,
      },
    ],
    commonMistakes: [
      'Relying on a single technique (e.g. mass spec only) for structural confirmation',
      'Omitting comparator standards for impurity structural elucidation',
    ],
    submissionTypes: ['NDA', 'BLA', 'sNDA', 'sBLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_CONTAINER_CLOSURE_QUALIFICATION_MISSING',
    patternName: 'Container-closure system not adequately qualified (3.2.P.7)',
    category: 'cmc_data',
    triggerDescription:
      'Container-closure system qualification lacks extractables/leachables (per USP <1663>/<1664>, FDA guidance), CCI testing, or compatibility studies for the proposed shelf life and storage conditions.',
    typicalFdaLanguage: [
      'Extractables and leachables data for the proposed container closure system have not been provided',
      'Container closure integrity testing has not been performed to support the proposed shelf life',
    ],
    frequencyRate: 0.07,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 180,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Run extractables/leachables study',
        details: 'Execute extractables on the container components, then leachables on product stored at long-term conditions through proposed shelf life.',
        timelineDays: 150,
      },
      {
        stepNumber: 2,
        action: 'Run CCI testing on representative batches',
        details: 'Use a validated CCI method (helium leak, vacuum decay, dye ingress) per USP <1207>.',
        timelineDays: 45,
      },
    ],
    commonMistakes: [
      'Using supplier extractables data as a substitute for product-specific leachables',
      'Skipping CCI on parenteral products by relying on dye ingress alone',
    ],
    submissionTypes: ['NDA', 'BLA', 'sNDA', 'sBLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_PROCESS_VALIDATION_LIFECYCLE_GAP',
    patternName: 'Process validation does not follow lifecycle approach (Stage 1–3)',
    category: 'cmc_data',
    triggerDescription:
      'Process validation submitted as legacy three-batch PPQ without the Stage 1 (design) and Stage 3 (continued verification) elements required under the 2011 FDA Process Validation Guidance and ICH Q8/Q10/Q11.',
    typicalFdaLanguage: [
      'The process validation approach is not consistent with the lifecycle framework described in the FDA Process Validation Guidance (2011)',
      'Continued process verification (Stage 3) plans have not been provided',
    ],
    frequencyRate: 0.05,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 120,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Document Stage 1 process design rationale',
        details: 'Provide QbD-based process understanding: CMA/CPP identification, risk assessments, DoE results, control strategy linkage.',
        timelineDays: 60,
      },
      {
        stepNumber: 2,
        action: 'Submit Stage 3 continued process verification plan',
        details: 'Specify the on-going monitoring program for CPPs/CQAs, statistical methods, and re-evaluation triggers.',
        timelineDays: 45,
      },
    ],
    commonMistakes: [
      'Treating PPQ as the entire validation deliverable',
      'Omitting in-process control trending strategy for the commercial phase',
    ],
    submissionTypes: ['NDA', 'BLA', 'sNDA', 'sBLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_ELEMENTAL_IMPURITIES_RISK_ASSESSMENT_MISSING',
    patternName: 'Elemental impurities risk assessment not provided (ICH Q3D)',
    category: 'cmc_data',
    triggerDescription:
      'Drug product application lacks the ICH Q3D / USP <232>/<233> elemental impurities risk assessment, or the assessment is qualitative only without quantitative data for Class 1 and 2A elements.',
    typicalFdaLanguage: [
      'An elemental impurities risk assessment consistent with ICH Q3D has not been provided',
      'Quantitative data for Class 1 and Class 2A elemental impurities are required',
    ],
    frequencyRate: 0.04,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 60,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Compile ICH Q3D Option 1/2A/2B/3 assessment',
        details: 'Identify potential sources (API, excipients, water, equipment, container), estimate total daily contributions vs PDE limits, document control approach.',
        timelineDays: 45,
      },
    ],
    commonMistakes: [
      'Relying on supplier statements without confirmatory testing for Class 1 elements',
      'Using a single batch result as steady-state evidence',
    ],
    submissionTypes: ['NDA', 'BLA', 'ANDA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_NITROSAMINE_RISK_ASSESSMENT_MISSING',
    patternName: 'Nitrosamine risk assessment and confirmatory testing not provided',
    category: 'cmc_data',
    triggerDescription:
      'Application lacks the three-step nitrosamine assessment (risk assessment → confirmatory testing → control strategy) required by FDA 2020/2023 guidance for human drugs. Applies to all NDAs/ANDAs/BLAs irrespective of dosage form.',
    typicalFdaLanguage: [
      'A nitrosamine impurity risk assessment consistent with FDA guidance has not been provided',
      'Confirmatory testing using a validated method has not been submitted for nitrosamine impurities identified as at risk',
    ],
    frequencyRate: 0.08,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 90,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Execute three-step assessment',
        details: 'Risk-assess the API and DP for nitrosamine and NDSRI formation; run validated GC-MS/LC-MS-MS confirmatory testing; establish a control strategy with acceptable intake limits.',
        timelineDays: 75,
      },
    ],
    commonMistakes: [
      'Treating nitrosamine assessment as an FDA-specific exercise; EMA, Health Canada, and PMDA expect the same',
      'Skipping NDSRI assessment for secondary/tertiary amine APIs',
    ],
    submissionTypes: ['NDA', 'BLA', 'ANDA', 'sNDA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_REFERENCE_STANDARDS_QUALIFICATION_MISSING',
    patternName: 'Reference standards qualification documentation incomplete (3.2.S.5)',
    category: 'cmc_data',
    triggerDescription:
      'Primary and working reference standards lack qualification certificates, traceability to compendial or international standard, or value-assignment procedures per ICH Q6A/Q6B and USP <11>.',
    typicalFdaLanguage: [
      'Reference standard qualification documentation is insufficient to support the analytical procedures',
      'Traceability of the working standard to the primary reference standard has not been established',
    ],
    frequencyRate: 0.03,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 60,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Provide qualification certificates and traceability chain',
        details: 'Include CoAs for primary and working standards, value-assignment protocol, stability data, and the bracketing/replacement cadence.',
        timelineDays: 30,
      },
    ],
    commonMistakes: [
      'Using a single in-house lot as a primary standard without orthogonal verification',
      'Omitting stability monitoring for in-house working standards',
    ],
    submissionTypes: ['NDA', 'BLA', 'ANDA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_COMPARABILITY_PROTOCOL_MISSING',
    patternName: 'Comparability protocol absent for post-approval manufacturing changes',
    category: 'cmc_data',
    triggerDescription:
      'Submission anticipates post-approval changes (site, scale, process, supplier) without a comparability protocol per ICH Q5E (biologics) / Q12 (small molecules), forcing each change into a full PAS.',
    typicalFdaLanguage: [
      'A comparability protocol has not been provided for the anticipated post-approval changes',
      'Without an approved Established Conditions and PACMP framework, manufacturing changes will require prior approval supplements',
    ],
    frequencyRate: 0.03,
    preventability: 'preventable',
    recoveryTimelineDays: 60,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Draft a comparability protocol / PACMP',
        details: 'Specify the change scope, comparability acceptance criteria, analytical strategy, and the reduced reporting category sought (CBE-30 vs PAS).',
        timelineDays: 45,
      },
    ],
    commonMistakes: [
      'Submitting only post-change data without pre-defined acceptance criteria',
      'Limiting comparability to release tests; FDA expects forced-degradation and characterization too',
    ],
    submissionTypes: ['NDA', 'BLA', 'sNDA', 'sBLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'CMC_STERILITY_ASSURANCE_PACKAGE_INCOMPLETE',
    patternName: 'Sterility assurance package incomplete for aseptic / terminal sterilization',
    category: 'cmc_data',
    triggerDescription:
      'Sterile drug product application lacks complete sterilization validation per FDA 2004 Aseptic Processing Guidance, including media fills, depyrogenation validation, sterilizing filter validation, and bioburden controls.',
    typicalFdaLanguage: [
      'The sterility assurance information provided is insufficient to support the proposed manufacturing process',
      'Media fill validation data are required to support the aseptic processing operation',
    ],
    frequencyRate: 0.06,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 180,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Execute and document missing sterilization validation elements',
        details: 'Run three successful media fills at commercial scale, validate sterilizing-grade filters with worst-case bioburden, document depyrogenation cycle development.',
        timelineDays: 150,
      },
    ],
    commonMistakes: [
      'Re-using legacy clinical-scale media fill data for commercial filling lines',
      'Omitting filter integrity testing on the bracketing study batches',
    ],
    submissionTypes: ['NDA', 'BLA', 'ANDA'],
    applicableCenters: ['CDER', 'CBER'],
  },
];
