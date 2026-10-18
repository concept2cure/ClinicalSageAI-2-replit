/**
 * Medical Device & IVD Regulatory tools — exposes the deterministic knowledge
 * engines in `server/services/medical-device/medical-device-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   classify_medical_device          — classify_device's engine and definition (EU MDR/IVDR class, FDA pathway)
 *   select_device_pathway            — US pathway + EU conformity route
 *   assess_substantial_equivalence   — 510(k) substantial-equivalence analysis
 *   design_device_clinical_evidence  — clinical evidence strategy (US + EU)
 *   assess_essential_principles       — GSPR / essential-principles conformity matrix
 *   plan_device_submission           — submission content, timeline, Q-Sub strategy
 *
 * @module server/services/ana/medicalDeviceTools
 */

import type { AnaTool } from '../ai-gateway/types';
import { IVDR_CLASSES } from '../../../shared/regulatory/device-class.js';
import { CLASSIFY_DEVICE as CANONICAL_CLASSIFY_DEVICE } from './submission-center-tool-defs.js';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_medical_device — classify_device under a second name
// ─────────────────────────────────────────────────────────────────────────────

/*
 * 2026-10-15: this tool ran classifyDevice (medical-device-knowledge.ts), a second
 * classification engine whose every branch fell through to the lowest class: with
 * no device facts it stated US Class I and EU MDR Class I, "no notified body". It
 * is now classify_device under its own name — the canonical definition here, the
 * canonical handler in AnaToolExecutor.ts — so the fail-closed engine in
 * market-specs/device-classification.ts answers it. The name stays because the
 * tool register and the launch-scope inventory list it.
 */
export const CLASSIFY_DEVICE: AnaTool = { ...CANONICAL_CLASSIFY_DEVICE, name: 'classify_medical_device' };

// ─────────────────────────────────────────────────────────────────────────────
// 2. select_device_pathway
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_DEVICE_PATHWAY: AnaTool = {
  name: 'select_device_pathway',
  description:
    'Select the US premarket pathway (510(k) premarket notification, De Novo classification, PMA, ' +
    'Humanitarian Device Exemption (HDE), 510(k)-exempt, IDE-then-PMA, or BLA) and the EU conformity ' +
    'assessment route (self-certification vs notified-body involvement), with rationale, alternatives, ' +
    'and an approximate FDA review clock. Implements the decision logic of 21 CFR 807.81 (when a 510(k) is ' +
    'required), FD&C Act §513(f)(2) and 21 CFR 860 Subpart D (De Novo), 21 CFR 814 (PMA/HDE), and MDR/IVDR ' +
    'conformity routing by class. Handles HUD/HDE eligibility (not more than 8,000 US patients/year, with an OOPD ' +
    'HUD designation), predicate availability, 510(k) exemption by product code, novel low/moderate-risk ' +
    'devices, biologics, and EU Class I sterile/measuring/reusable-instrument special routes. When the inputs ' +
    'cannot decide the US pathway it returns "undetermined" with a NEEDS-INPUT finding naming what is missing. ' +
    'Use when the user needs to choose a regulatory filing pathway for a device or IVD. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'unclassified'],
        description: 'US device class (from classify_device or a known product code).',
      },
      predicateExists: {
        type: 'boolean',
        description: 'Whether a legally marketed predicate device of the same type exists (enables 510(k)).',
      },
      novelLowModerateRisk: {
        type: 'boolean',
        description: 'Whether the device is a novel low-to-moderate-risk type with no predicate (De Novo candidate).',
      },
      humanitarianUseDevice: {
        type: 'boolean',
        description: 'Whether the device targets a rare condition and may qualify as a Humanitarian Use Device (HDE).',
      },
      estimatedAnnualUSPopulation: {
        type: 'number',
        description: 'Estimated US patient population per year. Not more than 8,000 supports HUD/HDE eligibility; without it HDE is undetermined.',
      },
      exempt: {
        type: 'boolean',
        description: 'Whether the product code\'s classification regulation exempts it from 510(k) with no .9 limitation applying. Without it a class I device is undetermined.',
      },
      isBiologic: {
        type: 'boolean',
        description: 'Whether the product incorporates a biologic regulated under a BLA (PHS Act §351).',
      },
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (selects IVDR conformity routing).' },
      euMdrClass: {
        type: 'string',
        enum: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'],
        description: 'EU MDR class for conformity routing (provide for non-IVD EU products).',
      },
      euIvdrClass: {
        type: 'string',
        enum: [...IVDR_CLASSES],
        description: 'EU IVDR class for conformity routing (provide for IVD EU products).',
      },
      sterile: {
        type: 'boolean',
        description: 'Whether the device is supplied sterile (affects the EU Class I/A conformity route). Unstated, an IVDR Class A route is undetermined.',
      },
      measuringFunction: {
        type: 'boolean',
        description: 'Whether the device has a measuring function (affects the EU Class I conformity route).',
      },
      reusableSurgicalInstrument: {
        type: 'boolean',
        description: 'Whether the device is a reusable surgical instrument (affects the EU Class I conformity route).',
      },
    },
    required: ['usClass', 'predicateExists'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_substantial_equivalence
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_SUBSTANTIAL_EQUIVALENCE: AnaTool = {
  name: 'assess_substantial_equivalence',
  description:
    'Perform a 510(k) substantial-equivalence (SE) analysis following the FDA 510(k) Program decision ' +
    'flowchart (2014 guidance) and 21 CFR 807.100(b): validate the predicate, confirm the same intended use, ' +
    'compare technological characteristics, decide whether different characteristics raise different questions ' +
    'of safety/effectiveness, and identify the performance data needed to show the device is as safe and ' +
    'effective as the predicate. A step the flow reaches with no answer is refused (predicateIdentified, ' +
    'sameIntendedUse, sameTechnologicalCharacteristics) or left open: with differentQuestionsOfSafetyEffectiveness ' +
    'or performanceDataDemonstratesEquivalence unstated the determination is indeterminate, never SE. ' +
    'Returns the SE/NSE/indeterminate determination with a step-by-step decision ' +
    'path, predicate adequacy, the specific performance data required (bench, biocompatibility, sterilization, ' +
    'software/cybersecurity, IVD analytical/clinical performance), and the recommended 510(k) submission type ' +
    '(Traditional/Special/Abbreviated) or a De Novo fallback when no valid predicate exists. Use when the user ' +
    'is preparing a 510(k) and needs to test substantial equivalence against a predicate. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      subjectDeviceName: { type: 'string', description: 'Name of the subject (new) device (optional).' },
      predicateDeviceName: { type: 'string', description: 'Name or 510(k) number of the predicate device (optional).' },
      predicateIdentified: {
        type: 'boolean',
        description: 'Whether a legally marketed predicate device has been identified.',
      },
      sameIntendedUse: {
        type: 'boolean',
        description: 'Whether the subject device has the SAME intended use as the predicate (required for SE).',
      },
      sameTechnologicalCharacteristics: {
        type: 'boolean',
        description:
          'Whether the technological characteristics (materials, design, energy source, principle of operation) ' +
          'are the SAME as the predicate.',
      },
      differentQuestionsOfSafetyEffectiveness: {
        type: 'boolean',
        description:
          'If technological characteristics differ, whether those differences raise DIFFERENT questions of ' +
          'safety or effectiveness (which would make the device Not Substantially Equivalent). Unstated, the ' +
          'determination is indeterminate.',
      },
      performanceDataDemonstratesEquivalence: {
        type: 'boolean',
        description:
          'Whether available performance data demonstrate the device is as safe and effective as the predicate. ' +
          'If false, the determination is indeterminate pending the identified testing; unstated, it is ' +
          'indeterminate too (SE is never assumed).',
      },
      predicateRecalledForSafety: {
        type: 'boolean',
        description: 'Whether the proposed predicate was removed from the market for design-related safety reasons (invalidates it).',
      },
      usesReferenceDevice: {
        type: 'boolean',
        description: 'Whether a reference device is used to support new technological characteristics (cannot be the predicate).',
      },
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (drives analytical+clinical performance expectations).' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (drives software/cybersecurity data).' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (drives biocompatibility data).' },
      sterile: { type: 'boolean', description: 'Whether the device is supplied sterile (drives sterilization/packaging data).' },
    },
    required: ['predicateIdentified', 'sameIntendedUse', 'sameTechnologicalCharacteristics'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. design_device_clinical_evidence
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_DEVICE_CLINICAL_EVIDENCE: AnaTool = {
  name: 'design_device_clinical_evidence',
  description:
    'Build a clinical evidence strategy for a medical device or IVD: determine whether clinical data are ' +
    'required, recommend the study type(s) (no clinical / literature & clinical evaluation / real-world ' +
    'evidence / feasibility-first-in-human / pivotal / IVD clinical performance), and scope the EU clinical ' +
    'evaluation (MDR Article 61 & Annex XIV, MEDDEV 2.7/1 rev 4) or IVDR performance evaluation (Annex XIII). ' +
    'When a fact that decides it was not stated, clinicalDataRequired (or usIDERequired) is null and ' +
    'missingFacts names what to ask for: say it is not determined; never report clinical data or an IDE as ' +
    'not required. ' +
    'Returns whether a US IDE (21 CFR 812) is required for a significant-risk investigation, an evidence ' +
    'hierarchy, and benefit-risk framing per the FDA 2019 factors guidance. Use when the user must decide ' +
    'whether and how to generate clinical evidence for a device submission. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'unclassified'],
        description: 'US device class (Class III generally requires pivotal clinical evidence). Without it, "not required" is never answered.',
      },
      usPathway: {
        type: 'string',
        enum: ['510(k)', 'De Novo', 'PMA', 'HDE', 'exempt', 'IDE-then-PMA', 'BLA', 'undetermined'],
        description: 'Intended US pathway; PMA/HDE/IDE-then-PMA imply clinical data are required.',
      },
      novelTechnology: {
        type: 'boolean',
        description: 'Whether the device is first-of-a-kind technology or a new indication (raises clinical questions). State true or false: unstated leaves "not required" undetermined.',
      },
      clinicalDataNeededForSE: {
        type: 'boolean',
        description: 'Whether a 510(k) raises questions answerable only with clinical data. State true or false: unstated leaves "not required" undetermined.',
      },
      implantable: { type: 'boolean', description: 'Whether the device is implantable. State true or false: unstated leaves "not required" undetermined.' },
      lifeSustaining: { type: 'boolean', description: 'Whether the device is life-supporting/life-sustaining. State true or false: unstated leaves "not required" undetermined.' },
      isIVD: {
        type: 'boolean',
        description: 'Whether the device is an IVD (selects an IVD clinical performance study and IVDR Annex XIII).',
      },
      existingLiterature: {
        type: 'boolean',
        description: 'Whether substantial published literature exists for the device type/indication (enables a literature route).',
      },
      realWorldDataAvailable: {
        type: 'boolean',
        description: 'Whether fit-for-purpose real-world data (registries, EHR, claims) are available.',
      },
      euMarket: { type: 'boolean', description: 'Whether the device is also pursuing the EU market (scopes MDR/IVDR evaluation).' },
      euMdrClass: {
        type: 'string',
        enum: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'],
        description: 'EU MDR class, when the EU market applies (implantable/Class III usually require clinical investigations).',
      },
      significantRisk: {
        type: 'boolean',
        description: 'Whether the planned clinical investigation is a significant-risk study (US IDE trigger). Unstated leaves usIDERequired null unless the device is class III, implanted or life-supporting.',
      },
    },
    required: ['usClass'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_essential_principles
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ESSENTIAL_PRINCIPLES: AnaTool = {
  name: 'assess_essential_principles',
  description:
    'Build a General Safety and Performance Requirements (GSPR) / essential-principles conformity matrix for ' +
    'an EU MDR (Annex I) medical device or EU IVDR (Annex I) IVD. For each requirement the tool determines ' +
    'whether it is applicable, the evidence/standard that demonstrates conformity (ISO 14971 risk management, ' +
    'ISO 13485 QMS, IEC 62304 software, IEC 60601-1 electrical safety, ISO 10993 biocompatibility, ISO 11135/' +
    '11137/11607 sterility, IEC 62366-1 usability, CLSI EP / ISO 17511 for IVDs), and whether it is addressed ' +
    'or a gap. A requirement is addressed only by a stated input (a claimed standard, the QMS, the risk file); ' +
    'one whose device property was not stated is not-assessed (applicable null), never "not applicable". ' +
    'Returns the full conformity matrix, applicable/gap counts, a prioritized gap list, and an ' +
    'overall verdict: gaps-present, or insufficient-information when no QMS or risk-management file is in ' +
    'place or a row is not assessed. Nothing given here evidences lifetime, environment or labeling (GSPR 9, ' +
    '14, 23), so it does not report "conforming". Use when the user needs a GSPR/essential-principles checklist or ' +
    'gap analysis for EU technical documentation. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (selects IVDR Annex I instead of MDR Annex I).' },
      active: { type: 'boolean', description: 'Whether the device is electrically powered/active (triggers IEC 60601-1).' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (triggers IEC 62304).' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (triggers ISO 10993 biocompatibility).' },
      sterile: { type: 'boolean', description: 'Whether the device is supplied sterile (triggers sterilization/packaging GSPR).' },
      measuringFunction: { type: 'boolean', description: 'Whether the device has a measuring function (triggers metrological GSPR).' },
      incorporatesMedicinalSubstance: {
        type: 'boolean',
        description: 'Whether the device incorporates a medicinal substance (triggers the medicinal-substance consultation GSPR).',
      },
      emitsRadiation: { type: 'boolean', description: 'Whether the device emits ionizing/non-ionizing radiation (triggers radiation-protection GSPR).' },
      implantable: { type: 'boolean', description: 'Whether the device is implantable.' },
      layUse: { type: 'boolean', description: 'Whether the device is intended for lay/home use (emphasizes usability/human factors GSPR).' },
      qmsInPlace: {
        type: 'boolean',
        description: 'Whether an ISO 13485-conforming QMS is in place (a precondition for conformity assessment).',
      },
      riskManagementFile: {
        type: 'boolean',
        description: 'Whether an ISO 14971 risk-management file exists (required for GSPR Chapter I).',
      },
      standardsClaimed: {
        type: 'array',
        items: { type: 'string' },
        description:
          'List of standard IDs the manufacturer claims conformity to (e.g., ["ISO 14971:2019", "IEC 62304", ' +
          '"ISO 10993-1"]). Used to mark the corresponding GSPR rows as addressed.',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. plan_device_submission
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_DEVICE_SUBMISSION: AnaTool = {
  name: 'plan_device_submission',
  description:
    'Produce a submission plan for a medical device or IVD: the required content for the chosen US pathway ' +
    '(eSTAR/510(k) sections per 21 CFR 807.87, De Novo content per 21 CFR 860 Subpart D (860.220), PMA modules per 21 CFR ' +
    '814.20, HDE per 21 CFR 814.104, or general-controls file when exempt), the EU technical documentation ' +
    'set (MDR/IVDR Annex II/III: device description, labeling, design & manufacturing, GSPR checklist, ' +
    'benefit-risk, verification & validation, post-market surveillance), an indicative end-to-end timeline ' +
    '(Q-Sub, testing, compilation, FDA review clock, EU notified-body assessment), and a Pre-Submission ' +
    '(Q-Sub) strategy. Use when the user needs to scope the contents, sequence, and timeline of a device ' +
    'marketing submission. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usPathway: {
        type: 'string',
        enum: ['510(k)', 'De Novo', 'PMA', 'HDE', 'exempt', 'IDE-then-PMA', 'BLA', 'undetermined'],
        description: 'Target US pathway (from select_device_pathway). Drives the section set and review clock.',
      },
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (adds analytical/clinical performance sections). Unstated, the section stays on the plan marked undetermined.' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (adds software/cybersecurity section). Unstated, the section stays on the plan marked undetermined.' },
      sterile: { type: 'boolean', description: 'Whether the device is sterile (adds sterilization/packaging section). Unstated, the section stays on the plan marked undetermined.' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (adds biocompatibility section). Unstated, the section stays on the plan marked undetermined.' },
      clinicalDataIncluded: {
        type: 'boolean',
        description: 'Whether clinical data are part of the submission (adds clinical sections; lengthens the timeline). Unstated, the testing phase is not estimated.',
      },
      euMarket: { type: 'boolean', description: 'Whether the device is also pursuing the EU market (adds EU technical documentation + NB phase).' },
      euMdrClass: {
        type: 'string',
        enum: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'],
        description: 'EU MDR class for technical-documentation scoping.',
      },
      euIvdrClass: {
        type: 'string',
        enum: [...IVDR_CLASSES],
        description: 'EU IVDR class for technical-documentation scoping.',
      },
      preSubmissionDone: {
        type: 'boolean',
        description: 'Whether a Pre-Submission (Q-Sub) has already occurred (changes the timeline and Q-Sub strategy).',
      },
    },
    required: ['usPathway'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Medical device & IVD regulatory tools, spread into ALL_ANA_TOOLS. */
export const MEDICAL_DEVICE_TOOLS: AnaTool[] = [
  CLASSIFY_DEVICE,
  SELECT_DEVICE_PATHWAY,
  ASSESS_SUBSTANTIAL_EQUIVALENCE,
  DESIGN_DEVICE_CLINICAL_EVIDENCE,
  ASSESS_ESSENTIAL_PRINCIPLES,
  PLAN_DEVICE_SUBMISSION,
];
