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

// 2026-11-08: shortened so each description fits the gateway's 1,024 characters; it named a "generic drug
// submission", which these device tools never make.
const DETERMINISTIC_NOTE =
  'Deterministic: report the results and regulatory citations verbatim; do not recompute or reinterpret them. ' +
  'A malformed value is refused by field: relay the validation error.';

/** What an omitted true/false input means in every engine below. */
const NOT_STATED = 'Omitted or null stays not_stated (inputStates)';

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
    'assessment route (self-certification vs notified-body involvement), with rationale, alternatives and an ' +
    'approximate FDA review clock, per 21 CFR 807.81, FD&C Act §513(f)(2) and 21 CFR 860 Subpart D (De Novo), ' +
    '21 CFR 814 (PMA/HDE) and MDR/IVDR routing by class. Reads the predicate, product-code exemption, novelty, ' +
    'biologics, HUD/HDE eligibility (not more than 8,000 US patients/year, with an OOPD HUD designation) and the ' +
    'MDR Class I sterile/measuring/reusable routes. A pathway an unstated one of these facts could change is ' +
    '"undetermined", with NEEDS-INPUT findings. Use when the user needs to choose a regulatory filing pathway ' +
    'for a device or IVD. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'unclassified'],
        description: 'US device class (from classify_device or a known product code). Required.',
      },
      predicateExists: {
        type: 'boolean',
        description: 'Whether a legally marketed predicate device of the same type exists (enables 510(k)). Required, true or false.',
      },
      novelLowModerateRisk: {
        type: 'boolean',
        description: 'Whether the device is a novel low-to-moderate-risk type with no predicate (De Novo candidate). ' + NOT_STATED + '; with no predicate, a pathway it could change is undetermined.',
      },
      humanitarianUseDevice: {
        type: 'boolean',
        description: 'Whether the device targets a rare condition and may qualify as a Humanitarian Use Device (HDE). ' + NOT_STATED + '; for class III, a pathway it could change is undetermined.',
      },
      estimatedAnnualUSPopulation: {
        type: 'number',
        description: 'Estimated US patient population per year (0 or more). Not more than 8,000 supports HUD/HDE eligibility; without it HDE is undetermined.',
      },
      exempt: {
        type: 'boolean',
        description: 'Whether the product code\'s classification regulation exempts it from 510(k) with no .9 limitation applying. ' + NOT_STATED + ', and a pathway it could change is undetermined.',
      },
      isBiologic: {
        type: 'boolean',
        description: 'Whether the product incorporates a biologic regulated under a BLA (PHS Act §351). ' + NOT_STATED + ', and a pathway it could change is undetermined.',
      },
      isIVD: {
        type: 'boolean',
        description: 'Whether the device is an IVD (selects IVDR conformity routing). ' + NOT_STATED + ': one stated EU class names its regulation; with both stated the route is undetermined.',
      },
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
        description: 'Whether the device is supplied sterile (affects the MDR Class I and IVDR Class A routes). ' + NOT_STATED + ': an IVDR Class A route is undetermined, and so is an MDR Class I route with no aspect stated true.',
      },
      measuringFunction: {
        type: 'boolean',
        description: 'Whether the device has a measuring function (affects the MDR Class I route; not read for IVDR). ' + NOT_STATED + ': an MDR Class I route with no aspect stated true is undetermined.',
      },
      reusableSurgicalInstrument: {
        type: 'boolean',
        description: 'Whether the device is a reusable surgical instrument (affects the MDR Class I route). ' + NOT_STATED + ': an MDR Class I route with no aspect stated true is undetermined.',
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
    'Perform a 510(k) substantial-equivalence (SE) analysis per the FDA 510(k) Program decision ' +
    'flowchart and 21 CFR 807.100(b): validate the predicate, confirm the same intended use, ' +
    'compare technological characteristics, decide whether differences raise different questions of ' +
    'safety/effectiveness, and list the performance data needed. An unanswered predicate, intended-use or ' +
    'technology step is refused; an unstated recall, different-questions or performance-data answer never gives ' +
    'SE (indeterminate unless a stated answer is NSE). Returns the determination, its path, predicate adequacy, ' +
    'performance data (bench, biocompatibility, sterilization, software, IVD; undetermined while its ' +
    'property is unstated) and the 510(k) type (Traditional or Abbreviated; null while an unstated answer ' +
    'decides it) or a De Novo fallback. Use when preparing a 510(k). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      subjectDeviceName: { type: 'string', description: 'Name of the subject (new) device (optional; not read by the engine).' },
      predicateDeviceName: { type: 'string', description: 'Name or 510(k) number of the predicate device (optional; not read by the engine).' },
      predicateIdentified: {
        type: 'boolean',
        description: 'Whether a legally marketed predicate device has been identified. Required, true or false.',
      },
      sameIntendedUse: {
        type: 'boolean',
        description: 'Whether the subject device has the SAME intended use as the predicate (required for SE; refused when the flow reaches it unstated).',
      },
      sameTechnologicalCharacteristics: {
        type: 'boolean',
        description:
          'Whether the technological characteristics (materials, design, energy source, principle of operation) ' +
          'are the SAME as the predicate. Refused when the flow reaches it unstated.',
      },
      differentQuestionsOfSafetyEffectiveness: {
        type: 'boolean',
        description:
          'If technological characteristics differ, whether those differences raise DIFFERENT questions of ' +
          'safety or effectiveness (which would make the device Not Substantially Equivalent). Unstated, the ' +
          'determination is indeterminate and the 510(k) type null.',
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
        description: 'Whether the proposed predicate was removed from the market for design-related safety reasons (invalidates it). ' + NOT_STATED + ': the determination is never SE and the 510(k) type is null, indeterminate unless a stated answer gives NSE.',
      },
      usesReferenceDevice: {
        type: 'boolean',
        description: 'Whether a reference device is used to support new technological characteristics (cannot be the predicate). ' + NOT_STATED + '; read only when the technology differs and is not stated to raise different questions, where true adds a reference-device note.',
      },
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (drives analytical+clinical performance expectations). ' + NOT_STATED + ': its data is undetermined, and with the same technology the 510(k) type is null unless hasSoftware is true.' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (drives software/cybersecurity data). ' + NOT_STATED + ': its data is undetermined, and with the same technology the 510(k) type is null unless isIVD is true.' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (drives biocompatibility data). ' + NOT_STATED + ': that data is undetermined.' },
      sterile: { type: 'boolean', description: 'Whether the device is supplied sterile (drives sterilization/packaging data). ' + NOT_STATED + ': that data is undetermined.' },
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
    'Build a clinical evidence strategy for a device or IVD: whether clinical data are required, the ' +
    'study type(s) (no clinical / literature & clinical evaluation / real-world evidence / ' +
    'feasibility-first-in-human / pivotal / IVD clinical performance), and the EU clinical evaluation (MDR ' +
    'Article 61 & Annex XIV, MEDDEV 2.7/1 rev 4) or IVDR performance evaluation (Annex XIII). When a fact that ' +
    'decides it was not stated, clinicalDataRequired (or usIDERequired) is null and missingFacts names what to ' +
    'ask for: say it is not determined; never report clinical data or an IDE as not required. A study or EU ' +
    'evaluation an unstated fact decides is named, not assumed. Also returns the US IDE (21 CFR 812) answer, ' +
    'an evidence hierarchy and FDA 2019 benefit-risk framing. Use to decide whether and how to generate clinical ' +
    'evidence for a device submission. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'unclassified'],
        description: 'US device class (Class III generally requires pivotal clinical evidence). Without it, "not required" is never answered; another value is refused.',
      },
      usPathway: {
        type: 'string',
        enum: ['510(k)', 'De Novo', 'PMA', 'HDE', 'exempt', 'IDE-then-PMA', 'BLA', 'undetermined'],
        description: 'Intended US pathway; PMA/HDE/IDE-then-PMA imply clinical data are required. Omitted, it is read as none of those.',
      },
      novelTechnology: {
        type: 'boolean',
        description: 'Whether the device is first-of-a-kind technology or a new indication (raises clinical questions). State true or false: unstated leaves "not required" undetermined and, for a device not class III, implanted or life-supporting, a feasibility study not assessed.',
      },
      clinicalDataNeededForSE: {
        type: 'boolean',
        description: 'Whether a 510(k) raises questions answerable only with clinical data. State true or false: unstated leaves "not required" undetermined.',
      },
      implantable: { type: 'boolean', description: 'Whether the device is implantable. State true or false: unstated leaves "not required" undetermined.' },
      lifeSustaining: { type: 'boolean', description: 'Whether the device is life-supporting/life-sustaining. State true or false: unstated leaves "not required" undetermined.' },
      isIVD: {
        type: 'boolean',
        description: 'Whether the device is an IVD (selects an IVD clinical performance study and IVDR Annex XIII). ' + NOT_STATED + ': the confirmatory study and the EU evaluation are not assessed.',
      },
      existingLiterature: {
        type: 'boolean',
        description: 'Whether substantial published literature exists for the device type/indication (enables a literature route). ' + NOT_STATED + ': that route is not assessed.',
      },
      realWorldDataAvailable: {
        type: 'boolean',
        description: 'Whether fit-for-purpose real-world data (registries, EHR, claims) are available. ' + NOT_STATED + ': real-world evidence is not assessed.',
      },
      euMarket: { type: 'boolean', description: 'Whether the device is also pursuing the EU market (scopes MDR/IVDR evaluation). ' + NOT_STATED + ': no EU evaluation is scoped, and the plan says so.' },
      euMdrClass: {
        type: 'string',
        enum: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'],
        description: 'EU MDR class, when the EU market applies (implantable/Class III usually require clinical investigations). Unstated, with implantable not true, whether investigations are generally required is not assessed.',
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
    'Build a General Safety and Performance Requirements (GSPR) / essential-principles conformity matrix, MDR or ' +
    'IVDR Annex I (isIVD is required): per requirement, whether it applies, the standard that shows conformity ' +
    '(ISO 14971, ISO 13485, IEC 62304 software, IEC 60601-1 electrical safety, ISO 10993 biocompatibility, ISO ' +
    '11135/11137/11607 sterility, IEC 62366-1 usability, CLSI EP / ISO 17511), and whether it is addressed or a ' +
    'gap. Only a stated input addresses a row (a claimed standard, the QMS, the risk file); a row an unstated ' +
    'device property, QMS or risk-file fact could change is not-assessed, never "not applicable" or a gap. The verdict ' +
    'is insufficient-information unless qmsInPlace and riskManagementFile are true, else gaps-present (nothing ' +
    'here evidences GSPR 9, 14 or 23). Use for a GSPR checklist or EU technical-file gap analysis. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (selects IVDR Annex I instead of MDR Annex I). Required, true or false.' },
      active: { type: 'boolean', description: 'Whether the device is electrically powered/active (triggers IEC 60601-1). ' + NOT_STATED + ': its row is not-assessed, and so is GSPR 19/20 unless implantable is true.' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (triggers IEC 62304). ' + NOT_STATED + ': its row is not-assessed.' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (triggers ISO 10993 biocompatibility). ' + NOT_STATED + ': for a non-IVD its row is not-assessed.' },
      sterile: { type: 'boolean', description: 'Whether the device is supplied sterile (triggers sterilization/packaging GSPR). ' + NOT_STATED + ': its row is not-assessed.' },
      measuringFunction: { type: 'boolean', description: 'Whether the device has a measuring function (triggers metrological GSPR). ' + NOT_STATED + ': for a non-IVD its row is not-assessed.' },
      incorporatesMedicinalSubstance: {
        type: 'boolean',
        description: 'Whether the device incorporates a medicinal substance (triggers the medicinal-substance consultation GSPR). ' + NOT_STATED + ': its row is not-assessed.',
      },
      emitsRadiation: { type: 'boolean', description: 'Whether the device emits ionizing/non-ionizing radiation (triggers radiation-protection GSPR). ' + NOT_STATED + ': its row is not-assessed.' },
      implantable: { type: 'boolean', description: 'Whether the device is implantable. ' + NOT_STATED + ': GSPR 19/20 is not-assessed unless active is true.' },
      layUse: { type: 'boolean', description: 'Whether the device is intended for lay/home use. Not read: usability (GSPR 5) is addressed only by a claimed IEC 62366.' },
      qmsInPlace: {
        type: 'boolean',
        description: 'Whether an ISO 13485-conforming QMS is in place (a precondition for conformity assessment). ' + NOT_STATED + ': GSPR 4 is not-assessed, not a gap, unless riskManagementFile is false.',
      },
      riskManagementFile: {
        type: 'boolean',
        description: 'Whether an ISO 14971 risk-management file exists (required for GSPR Chapter I). ' + NOT_STATED + ': GSPR 1-3 are not-assessed, not gaps, and so is GSPR 4 unless qmsInPlace is false.',
      },
      standardsClaimed: {
        type: 'array',
        items: { type: 'string' },
        description:
          'List of standard IDs the manufacturer claims conformity to (e.g., ["ISO 14971:2019", "IEC 62304", ' +
          '"ISO 10993-1"]). Used to mark the corresponding GSPR rows as addressed; omitted, none is claimed.',
      },
    },
    required: ['isIVD'],
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
    'benefit-risk, verification & validation, post-market surveillance), an indicative timeline ' +
    '(Q-Sub, testing, compilation, FDA review clock, EU notified-body assessment), and a Pre-Submission ' +
    '(Q-Sub) strategy. A section an unstated device fact decides stays on the plan marked undetermined, and an ' +
    'unstated EU market or Pre-Submission is named. Use to scope the contents, sequence and timeline of a device ' +
    'marketing submission. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usPathway: {
        type: 'string',
        enum: ['510(k)', 'De Novo', 'PMA', 'HDE', 'exempt', 'IDE-then-PMA', 'BLA', 'undetermined'],
        description: 'Target US pathway (from select_device_pathway). Drives the section set and review clock. Required.',
      },
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (adds analytical/clinical performance sections). ' + NOT_STATED + ': those sections stay on the plan marked undetermined, and the EU documentation names MDR or IVDR.' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (adds software/cybersecurity section). ' + NOT_STATED + ': the section stays on the plan marked undetermined.' },
      sterile: { type: 'boolean', description: 'Whether the device is sterile (adds sterilization/packaging section). ' + NOT_STATED + ': the section stays on the plan marked undetermined.' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (adds the biocompatibility section of an HDE, BLA or undetermined plan; the eSTAR plans always carry it). ' + NOT_STATED + ': that section stays marked undetermined.' },
      clinicalDataIncluded: {
        type: 'boolean',
        description: 'Whether clinical data are part of the submission (adds clinical sections; lengthens the timeline). ' + NOT_STATED + ': the testing phase is not estimated.',
      },
      euMarket: { type: 'boolean', description: 'Whether the device is also pursuing the EU market (adds EU technical documentation + NB phase). ' + NOT_STATED + ': no EU documentation is planned, and a finding says so.' },
      euMdrClass: {
        type: 'string',
        enum: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'],
        description: 'EU MDR class. Not read by the plan.',
      },
      euIvdrClass: {
        type: 'string',
        enum: [...IVDR_CLASSES],
        description: 'EU IVDR class. Not read by the plan.',
      },
      preSubmissionDone: {
        type: 'boolean',
        description: 'Whether a Pre-Submission (Q-Sub) has already occurred (changes the timeline and Q-Sub strategy). ' + NOT_STATED + ': the Q-Sub strategy, and the Q-Sub phase where there is one, say it was not stated.',
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
