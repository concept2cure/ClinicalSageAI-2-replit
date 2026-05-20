/**
 * Seed RTF trigger patterns for Module 4 (Nonclinical) data.
 *
 * Each pattern maps to a deficiency the FDA tox reviewer can issue when
 * filing an IND/NDA/BLA. The codes are referenced by the preclinical
 * reviewer persona so a deficiency raised at review time can be traced
 * back to a known RTF pattern with a recovery playbook.
 *
 * Frequencies are conservative estimates from public RTF letters; refine
 * once internal precedent data is loaded.
 */

import type { RTFTriggerPattern } from '../rtf-trigger-service';

export type NonclinicalRtfSeed = Omit<
  RTFTriggerPattern,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt'
>;

export const NONCLINICAL_RTF_PATTERNS: NonclinicalRtfSeed[] = [
  {
    patternCode: 'NC_GLP_PIVOTAL_MISSING',
    patternName: 'Pivotal toxicology study not GLP-compliant',
    category: 'nonclinical_data',
    triggerDescription:
      'A pivotal toxicology study supporting first-in-human dosing was not conducted under 21 CFR Part 58 GLP. FDA generally cannot rely on non-GLP pivotal data for safety conclusions.',
    typicalFdaLanguage: [
      'The pivotal toxicology study was not conducted in compliance with 21 CFR Part 58',
      'GLP non-compliance precludes use of these data to support clinical dosing',
    ],
    frequencyRate: 0.08,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 180,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Locate GLP-compliant bridging study',
        details: 'Identify or commission a GLP-compliant repeat-dose study at the same dose levels and species.',
        timelineDays: 90,
      },
      {
        stepNumber: 2,
        action: 'Submit amendment with GLP study report',
        details: 'File information amendment (IND) or major amendment (marketing app) with the GLP report.',
        timelineDays: 30,
      },
    ],
    commonMistakes: [
      'Treating exploratory tox data as pivotal',
      'Using contract research org without GLP attestation',
    ],
    submissionTypes: ['IND', 'NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'NC_SPECIES_COVERAGE',
    patternName: 'Repeat-dose toxicology missing required species',
    category: 'nonclinical_data',
    triggerDescription:
      'ICH M3(R2) requires repeat-dose toxicology in two species (rodent + non-rodent) for chronic clinical use. Missing the non-rodent study is a recurring RTF trigger.',
    typicalFdaLanguage: [
      'Repeat-dose toxicology data in a non-rodent species was not provided',
      'ICH M3(R2) recommends two-species coverage for the proposed clinical duration',
    ],
    frequencyRate: 0.12,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 270,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Initiate non-rodent repeat-dose study',
        details: 'Commission GLP study in a relevant non-rodent species (typically dog or non-human primate).',
        timelineDays: 240,
      },
    ],
    commonMistakes: [
      'Assuming rodent-only is sufficient for chronic indications',
      'Not selecting a pharmacologically relevant non-rodent species',
    ],
    submissionTypes: ['IND', 'NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'NC_GENOTOX_BATTERY_INCOMPLETE',
    patternName: 'ICH S2(R1) genotoxicity battery incomplete',
    category: 'nonclinical_data',
    triggerDescription:
      'ICH S2(R1) requires three components: bacterial reverse mutation (Ames), in vitro mammalian cell assay, and an in vivo genotoxicity test. Submissions missing any component are routinely refused.',
    typicalFdaLanguage: [
      'The genotoxicity battery is incomplete; an in vivo assay was not provided',
      'The Ames assay was not performed in accordance with ICH S2(R1)',
    ],
    frequencyRate: 0.06,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 120,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Run missing genotoxicity component(s)',
        details: 'Schedule and run the missing assay(s) at a GLP facility.',
        timelineDays: 90,
      },
    ],
    commonMistakes: [
      'Treating Ames + in vitro mammalian as sufficient',
      'Skipping the in vivo arm for marketed combinations',
    ],
    submissionTypes: ['IND', 'NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'NC_NOAEL_MARGIN_INSUFFICIENT',
    patternName: 'Insufficient NOAEL-to-MRHD safety margin',
    category: 'nonclinical_data',
    triggerDescription:
      'The safety margin between the NOAEL in the most sensitive species and the maximum recommended human dose (MRHD) is below the typical 10× threshold without a justifying scientific rationale.',
    typicalFdaLanguage: [
      'The exposure margin between the NOAEL and the proposed clinical dose is inadequate',
      'A safety margin below 10× requires additional justification',
    ],
    frequencyRate: 0.09,
    preventability: 'partially_preventable',
    recoveryTimelineDays: 90,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Provide pharmacokinetic exposure justification',
        details: 'Submit AUC/Cmax-based comparison and risk justification, or propose a lower starting dose.',
        timelineDays: 60,
      },
    ],
    commonMistakes: [
      'Comparing mg/kg only, ignoring exposure',
      'Selecting non-sensitive species as the basis for NOAEL',
    ],
    submissionTypes: ['IND', 'NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'NC_REPRO_TOX_STAGE_MISMATCH',
    patternName: 'Reproductive toxicology not staged with development',
    category: 'nonclinical_data',
    triggerDescription:
      'ICH M3(R2) §11 stages reproductive and developmental toxicology against the clinical phase and population. Required studies (fertility, embryo-fetal development, pre/postnatal) are missing for the proposed phase.',
    typicalFdaLanguage: [
      'Reproductive and developmental toxicology studies have not been completed prior to inclusion of women of childbearing potential',
    ],
    frequencyRate: 0.05,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 180,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Run staged DART package',
        details: 'Schedule fertility/EFD/PPND studies appropriate to the proposed clinical phase per ICH M3(R2) §11.',
        timelineDays: 150,
      },
    ],
    commonMistakes: [
      'Assuming WOCBP exclusion negates DART requirements',
      'Not staging studies by clinical phase',
    ],
    submissionTypes: ['IND', 'NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'NC_CARC_REQUIRED_MISSING',
    patternName: 'Carcinogenicity study required but missing',
    category: 'nonclinical_data',
    triggerDescription:
      'ICH S1B requires carcinogenicity assessment for drugs intended for chronic use (≥6 months continuous, or repeated intermittent use). The submission lacks a completed carcinogenicity study or rationale for waiver.',
    typicalFdaLanguage: [
      'A carcinogenicity assessment per ICH S1B has not been provided',
      'Justification for the absence of a carcinogenicity study is required',
    ],
    frequencyRate: 0.04,
    preventability: 'preventable',
    recoveryTimelineDays: 730,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Initiate 2-year carcinogenicity study or rasH2 alternative',
        details: 'Begin chronic carc study or 6-month transgenic alternative; otherwise file scientific waiver request.',
        timelineDays: 540,
      },
    ],
    commonMistakes: [
      'Filing chronic-use indication without carc plan',
      'Missing pre-IND alignment on carcinogenicity strategy',
    ],
    submissionTypes: ['NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
  {
    patternCode: 'NC_TK_DATA_MISSING',
    patternName: 'Toxicokinetic data missing for pivotal toxicology',
    category: 'nonclinical_data',
    triggerDescription:
      'Pivotal repeat-dose toxicology submitted without supporting toxicokinetic exposure data. Without TK, exposure-based dose justification cannot be evaluated.',
    typicalFdaLanguage: [
      'Toxicokinetic data supporting the pivotal toxicology study were not provided',
    ],
    frequencyRate: 0.03,
    preventability: 'highly_preventable',
    recoveryTimelineDays: 60,
    recoverySteps: [
      {
        stepNumber: 1,
        action: 'Submit TK report from satellite groups',
        details: 'Compile and submit AUC/Cmax data from satellite/main-study sampling.',
        timelineDays: 45,
      },
    ],
    commonMistakes: [
      'Omitting TK satellite groups from study design',
      'Not bridging TK data across species',
    ],
    submissionTypes: ['IND', 'NDA', 'BLA'],
    applicableCenters: ['CDER', 'CBER'],
  },
];
