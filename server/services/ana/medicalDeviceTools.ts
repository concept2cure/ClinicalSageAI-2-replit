/**
 * Medical Device & IVD Regulatory tools — exposes the deterministic knowledge
 * engines in `server/services/medical-device/medical-device-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   classify_device                  — US (I/II/III) + EU MDR/IVDR classification
 *   select_device_pathway            — US pathway + EU conformity route
 *   assess_substantial_equivalence   — 510(k) substantial-equivalence analysis
 *   design_device_clinical_evidence  — clinical evidence strategy (US + EU)
 *   assess_essential_principles       — GSPR / essential-principles conformity matrix
 *   plan_device_submission           — submission content, timeline, Q-Sub strategy
 *
 * @module server/services/ana/medicalDeviceTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_device
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_DEVICE: AnaTool = {
  name: 'classify_medical_device',
  description:
    'Classify a medical device or in-vitro diagnostic (IVD) into its US risk class (Class I/II/III ' +
    'per 21 CFR 860.3) and its EU class (MDR Class I/IIa/IIb/III per Regulation (EU) 2017/745 Annex VIII, ' +
    'or IVDR Class A/B/C/D per Regulation (EU) 2017/746 Annex VIII) from the intended use, risk level, ' +
    'invasiveness, contact duration, and contact site. Returns the US class with rationale, the applicable ' +
    'EU classification rule(s) (e.g., MDR Rule 8/11/14, IVDR Rule 1-6), whether general/special controls or ' +
    'premarket approval apply, the EU conformity implications, and cross-cutting requirements (ISO 14971 risk ' +
    'management, ISO 10993 biocompatibility, IEC 62304 software). Use when the user needs to know the ' +
    'regulatory class of a device or IVD, which classification rule governs, or whether the device is ' +
    'self-certified vs notified-body / PMA. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      deviceName: {
        type: 'string',
        description: 'Plain-language name of the device (optional, for labeling the result).',
      },
      intendedUse: {
        type: 'string',
        description:
          'The intended use / indications-for-use statement. Drives both US classification and the ' +
          'EU classification rule selection.',
      },
      isIVD: {
        type: 'boolean',
        description:
          'Whether the device is an in-vitro diagnostic. If true, EU classification uses the IVDR ' +
          'Annex VIII rules (Class A-D) instead of the MDR rules.',
      },
      isSoftware: {
        type: 'boolean',
        description:
          'Whether the device incorporates software or is Software as a Medical Device (SaMD). ' +
          'Triggers MDR Rule 11 in the EU and IEC 62304 life-cycle requirements.',
      },
      riskLevel: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Level of patient harm if the device fails or is misused. The primary driver of US class ' +
          'and a tie-breaker within EU rules.',
      },
      invasiveness: {
        type: 'string',
        enum: [
          'non-invasive',
          'invasive-body-orifice',
          'surgically-invasive',
          'implantable',
          'active',
          'active-implantable',
        ],
        description: 'Invasiveness category; the primary selector among MDR Annex VIII rules 1-13.',
      },
      contactDuration: {
        type: 'string',
        enum: ['transient', 'short-term', 'long-term'],
        description:
          'Duration of continuous body contact/use per MDR Annex VIII §1.1 (transient <60 min, ' +
          'short-term <=30 days, long-term >30 days). Escalates several invasive-device rules.',
      },
      contactSite: {
        type: 'string',
        enum: ['skin-intact', 'mucosal', 'breached-skin', 'blood-indirect', 'circulatory-cns', 'none'],
        description:
          'Body contact site. "circulatory-cns" (heart, central circulatory system, or CNS) escalates ' +
          'invasive devices to Class III; drives biocompatibility scope.',
      },
      implantable: { type: 'boolean', description: 'Whether the device is intended to be implanted.' },
      lifeSustaining: {
        type: 'boolean',
        description: 'Whether the device is life-supporting or life-sustaining (drives US Class III).',
      },
      active: {
        type: 'boolean',
        description: 'Whether the device delivers/exchanges energy or substances to/from the body (active device).',
      },
      administersMedicine: {
        type: 'boolean',
        description: 'Whether the device administers or removes a medicinal product/fluid (MDR Rule 12).',
      },
      incorporatesMedicinalSubstance: {
        type: 'boolean',
        description:
          'Whether the device incorporates a medicinal substance with ancillary action (MDR Rule 14 → Class III).',
      },
      absorbedSubstance: {
        type: 'boolean',
        description: 'Whether the device is composed of substances absorbed by the body (MDR Rule 21).',
      },
      animalOrHumanTissue: {
        type: 'boolean',
        description: 'Whether the device uses non-viable tissues/cells of human or animal origin (MDR Rule 18 → Class III).',
      },
      ivdHighRiskTransmissible: {
        type: 'boolean',
        description: 'IVD detects a transmissible agent with high propagation risk (IVDR Rule 1 → Class D).',
      },
      ivdDonorScreening: {
        type: 'boolean',
        description: 'IVD used for blood/organ donor screening or transmissible-agent compatibility (IVDR Rule 1 → Class D).',
      },
      ivdTransmissibleModerate: {
        type: 'boolean',
        description: 'IVD detects a transmissible agent of moderate public-health risk (IVDR Rule 2/3 → Class C).',
      },
      ivdCompanionDiagnostic: {
        type: 'boolean',
        description: 'IVD is a companion diagnostic (IVDR Rule 3(c) → Class C).',
      },
      ivdManagementCritical: {
        type: 'boolean',
        description: 'IVD informs disease staging/screening/management decisions (IVDR Rule 3 → Class C).',
      },
      ivdSelfTesting: {
        type: 'boolean',
        description: 'IVD is intended for self-testing (IVDR Rule 4 → generally Class C).',
      },
      ivdGeneralReagent: {
        type: 'boolean',
        description: 'IVD is a general reagent/instrument/buffer with no specific intended purpose (IVDR Rule 5 → Class A).',
      },
    },
    required: ['intendedUse', 'riskLevel'],
  },
};

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
    'required), 21 CFR 860.93 (De Novo), 21 CFR 814 (PMA/HDE), and MDR/IVDR conformity routing by class. ' +
    'Handles HUD/HDE eligibility (<8,000 US patients/year), predicate availability, novel low/moderate-risk ' +
    'devices, biologics, and EU Class I sterile/measuring/reusable-instrument special routes. Use when the ' +
    'user needs to choose a regulatory filing pathway for a device or IVD. ' + DETERMINISTIC_NOTE,
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
        description: 'Estimated US patient population per year. <8,000 supports HUD/HDE eligibility.',
      },
      exempt: {
        type: 'boolean',
        description: 'Whether the device/product code is 510(k)-exempt.',
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
        enum: ['A', 'B', 'C', 'D'],
        description: 'EU IVDR class for conformity routing (provide for IVD EU products).',
      },
      sterile: {
        type: 'boolean',
        description: 'Whether the device is supplied sterile (affects the EU Class I/A conformity route).',
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
    'effective as the predicate. Returns the SE/NSE/indeterminate determination with a step-by-step decision ' +
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
          'safety or effectiveness (which would make the device Not Substantially Equivalent).',
      },
      performanceDataDemonstratesEquivalence: {
        type: 'boolean',
        description:
          'Whether available performance data demonstrate the device is as safe and effective as the predicate. ' +
          'If false, the determination is indeterminate pending the identified testing.',
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
    'Returns whether a US IDE (21 CFR 812) is required for a significant-risk investigation, an evidence ' +
    'hierarchy, and benefit-risk framing per the FDA 2019 factors guidance. Use when the user must decide ' +
    'whether and how to generate clinical evidence for a device submission. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      usClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'unclassified'],
        description: 'US device class (Class III generally requires pivotal clinical evidence).',
      },
      usPathway: {
        type: 'string',
        enum: ['510(k)', 'De Novo', 'PMA', 'HDE', 'exempt', 'IDE-then-PMA', 'BLA', 'undetermined'],
        description: 'Intended US pathway; PMA/HDE/IDE-then-PMA imply clinical data are required.',
      },
      novelTechnology: {
        type: 'boolean',
        description: 'Whether the device is first-of-a-kind technology or a new indication (raises clinical questions).',
      },
      clinicalDataNeededForSE: {
        type: 'boolean',
        description: 'Whether a 510(k) raises questions answerable only with clinical data.',
      },
      implantable: { type: 'boolean', description: 'Whether the device is implantable.' },
      lifeSustaining: { type: 'boolean', description: 'Whether the device is life-supporting/life-sustaining.' },
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
        description: 'Whether the planned clinical investigation is a significant-risk study (US IDE trigger).',
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
    'or a gap. Returns the full conformity matrix, applicable/gap counts, a prioritized gap list, and an ' +
    'overall conformity verdict (conforming / gaps-present / insufficient-information, the latter when no QMS ' +
    'or risk-management file is in place). Use when the user needs a GSPR/essential-principles checklist or ' +
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
    '(eSTAR/510(k) sections per 21 CFR 807.87, De Novo content per 21 CFR 860.93, PMA modules per 21 CFR ' +
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
      isIVD: { type: 'boolean', description: 'Whether the device is an IVD (adds analytical/clinical performance sections).' },
      hasSoftware: { type: 'boolean', description: 'Whether the device contains software (adds software/cybersecurity section).' },
      sterile: { type: 'boolean', description: 'Whether the device is sterile (adds sterilization/packaging section).' },
      patientContacting: { type: 'boolean', description: 'Whether the device is patient-contacting (adds biocompatibility section).' },
      clinicalDataIncluded: {
        type: 'boolean',
        description: 'Whether clinical data are part of the submission (adds clinical sections; lengthens the timeline).',
      },
      euMarket: { type: 'boolean', description: 'Whether the device is also pursuing the EU market (adds EU technical documentation + NB phase).' },
      euMdrClass: {
        type: 'string',
        enum: ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'],
        description: 'EU MDR class for technical-documentation scoping.',
      },
      euIvdrClass: {
        type: 'string',
        enum: ['A', 'B', 'C', 'D'],
        description: 'EU IVDR class for technical-documentation scoping.',
      },
      preSubmissionDone: {
        type: 'boolean',
        description: 'Whether a Pre-Submission (Q-Sub) has already occurred (changes the timeline and Q-Sub strategy).',
      },
      useEStar: {
        type: 'boolean',
        description: 'Whether the submission will use the FDA eSTAR template (mandatory for 510(k)/De Novo).',
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
