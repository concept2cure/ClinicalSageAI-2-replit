/**
 * Digital Health, SaMD & AI/ML Device tools — exposes the deterministic
 * knowledge engines in `server/services/digital-health/digital-health-knowledge`
 * to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 * An omitted or null boolean stays not_stated and is never read as true or false,
 * except that assess_device_cybersecurity keeps its S3 rule (an unstated artifact counts
 * as a gap); a malformed value is refused by field (Rule 2 S5b, 2026-11-08).
 *
 * Tools:
 *   classify_samd                    — IMDRF N12 SaMD risk categorization (I-IV)
 *   assess_ai_ml_device              — AI/ML device assessment (locked/adaptive, autonomy, PCCP)
 *   design_pccp                      — Predetermined Change Control Plan builder
 *   assess_gmlp                      — Good Machine Learning Practice conformity (10 principles)
 *   design_samd_clinical_validation  — IMDRF N41 clinical evaluation evidence plan
 *   assess_device_cybersecurity      — Premarket cybersecurity + Section 524B
 *
 * @module server/services/ana/digitalHealthTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic, no LLM: report the findings and citations verbatim. If a parameter is missing or invalid, ' +
  'relay the validation error and ask the user for the correct value.';

/** What an omitted (or null) boolean means, per tool; a malformed one is refused by name. */
const NOT_STATED_NOTE = ' Omitted or null stays not_stated: its finding says it was not stated, never provided or missing.';
const NOT_READ = ' Not read: it does not change the result.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_samd
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_SAMD: AnaTool = {
  name: 'classify_samd',
  description:
    'Classify Software as a Medical Device (SaMD) into an IMDRF risk category (I-IV) with the IMDRF N12 ' +
    'framework: the state of the healthcare situation (non-serious / serious / critical) crossed with the ' +
    'significance of the information the software provides (inform / drive clinical management / treat or ' +
    'diagnose). Returns the matrix cell, the category and impact level, a risk narrative, the informationally ' +
    'implied US device class and likely pathway, QMS expectations (21 CFR 820.30 / QMSR, IEC 62304, ISO 14971, ' +
    'IMDRF N23), the clinical-evaluation rigor, a Clinical Decision Support (CDS) screen, and citations (IMDRF ' +
    'N10/N12/N41, FDA CDS Guidance 2022). An unstated SaMD-definition or platform fact is named in the ' +
    'considerations, not assumed. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      healthcareSituation: {
        type: 'string',
        enum: ['non-serious', 'serious', 'critical'],
        description:
          'State of the healthcare situation or condition the SaMD addresses. "critical" = ' +
          'situations/conditions where accurate/timely action is vital to avoid death, long-term ' +
          'disability, or other serious deterioration; "serious" = moderate, where timely action ' +
          'is important but a wider intervention window exists; "non-serious" = mild/slowly ' +
          'evolving conditions (IMDRF N12).',
      },
      informationSignificance: {
        type: 'string',
        enum: ['inform', 'drive', 'treat-or-diagnose'],
        description:
          'Significance of the information the SaMD provides. "treat-or-diagnose" = output is ' +
          'used to take immediate/near-term action to treat or diagnose; "drive" = output drives ' +
          'clinical management (aids in diagnosis, guides next steps); "inform" = output informs ' +
          'clinical management without triggering immediate action (IMDRF N12).',
      },
      intendedUse: {
        type: 'string',
        description: 'The SaMD definition statement / intended medical purpose (optional).' + NOT_READ,
      },
      meetsSaMDDefinition: {
        type: 'boolean',
        description:
          'Whether the software meets the IMDRF SaMD definition (software intended for a medical ' +
          'purpose that performs that purpose without being part of a hardware medical device). ' +
          'If false, the engine notes it may be SiMD (software in a device). Omitted or null stays not_stated: ' +
          'isSaMD is null and a consideration says so.',
      },
      generalPurposePlatform: {
        type: 'boolean',
        description:
          'Whether the software runs on a general-purpose computing platform (vs. an embedded / ' +
          'non-general-purpose platform). Affects the SaMD-vs-SiMD note. Omitted or null stays not_stated, and ' +
          'a consideration says so.',
      },
      targetPopulation: {
        type: 'string',
        description: 'Free-text description of the intended-use patient population (optional).' + NOT_READ,
      },
    },
    required: ['healthcareSituation', 'informationSignificance'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. assess_ai_ml_device
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_AI_ML_DEVICE: AnaTool = {
  name: 'assess_ai_ml_device',
  description:
    'Assess an AI/ML-enabled device software function: locked vs. adaptive (vs. hybrid) algorithm behavior, ' +
    'autonomy (assistive / augmentative / autonomous), transparency documentation, training-data ' +
    'representativeness and bias, external validation, real-world performance monitoring, and whether a ' +
    'Predetermined Change Control Plan (PCCP) is appropriate. Returns an autonomy narrative, a PCCP ' +
    'recommendation with rationale, transparency / bias / monitoring findings, risk flags (including ' +
    'generative/foundation-model risks), recommended actions, and citations (FDA AI/ML 2019 and 2021, FDA PCCP ' +
    'Guidance 2024, GMLP 2021, FDA Transparency 2024). An unstated fact is reported as not stated, never as ' +
    'provided; pccpRecommended is null for a locked model with planned modifications unstated. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      algorithmType: {
        type: 'string',
        enum: ['locked', 'adaptive', 'hybrid'],
        description:
          'Algorithm behavior over the lifecycle. "locked" = same output for the same input every ' +
          'time, weights do not change in the field; "adaptive" = changes behavior over time in ' +
          'the field (continuous learning); "hybrid" = locked at release but retrained/updated ' +
          'offline on a planned cadence.',
      },
      autonomyLevel: {
        type: 'string',
        enum: ['assistive', 'augmentative', 'autonomous'],
        description:
          'Level of autonomy. "assistive" = informs a clinician who independently reviews the ' +
          'basis; "augmentative" = drives management but a human makes the final decision; ' +
          '"autonomous" = delivers a diagnostic/treatment output without a clinician reviewing ' +
          'each case.',
      },
      samdCategory: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description:
          'IMDRF SaMD category (from classify_samd), for risk context (optional). Omitted for an autonomous ' +
          'function, a risk flag says the Category IV combination is not assessed.',
      },
      transparencyArtifactsProvided: {
        type: 'boolean',
        description:
          'Whether user-facing transparency documentation (model card / device label: inputs, ' +
          'intended population, data provenance, subgroup performance, limitations, required ' +
          'oversight) is provided. Set false to flag a gap.' + NOT_STATED_NOTE,
      },
      trainingDataRepresentative: {
        type: 'boolean',
        description:
          'Whether the training data are demonstrably representative of the intended-use ' +
          'population (GMLP Principle 3). Set false to flag a bias/representativeness gap.' + NOT_STATED_NOTE,
      },
      externalValidationPerformed: {
        type: 'boolean',
        description:
          'Whether independent external / multi-site validation was performed (GMLP Principles 4 ' +
          '& 6). Set false to flag a generalizability gap.' + NOT_STATED_NOTE,
      },
      realWorldMonitoring: {
        type: 'boolean',
        description:
          'Whether post-deployment real-world performance monitoring is in place (GMLP Principle ' +
          '10). Set false to flag a monitoring gap.' + NOT_STATED_NOTE,
      },
      plannedPostMarketModifications: {
        type: 'boolean',
        description:
          'Whether the manufacturer intends to modify the model after clearance (retraining, ' +
          'performance improvements, expanded inputs). Drives the PCCP recommendation. Omitted or null stays ' +
          'not_stated: for a locked model, pccpRecommended is null.',
      },
      intendedModifications: {
        type: 'string',
        description: 'Free-text description of intended post-market modifications (optional).' + NOT_READ,
      },
      usesGenerativeOrFoundationModel: {
        type: 'boolean',
        description:
          'Whether a generative or foundation-model component is involved. Adds risk flags for ' +
          'non-determinism, hallucination, opaque provenance, and a large/shifting input space. Omitted or null ' +
          'stays not_stated, and a risk flag says so.',
      },
    },
    required: ['algorithmType', 'autonomyLevel'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. design_pccp
// ─────────────────────────────────────────────────────────────────────────────

/** A scope fact left out is named in outOfScopeModifications. */
const SCOPE_NOT_STATED = ' Omitted or null stays not_stated, and outOfScopeModifications names it.';

export const DESIGN_PCCP: AnaTool = {
  name: 'design_pccp',
  description:
    'Design a Predetermined Change Control Plan (PCCP) for an AI/ML-enabled device per the FDA December 2024 ' +
    'guidance, to pre-authorize iterative AI/ML model updates without a new submission for each change. Builds the ' +
    'three FDA-required components (1) Description of Modifications, (2) Modification Protocol (data management, ' +
    'retraining, performance evaluation, update procedures), and (3) Impact Assessment, and flags modifications ' +
    'OUTSIDE a PCCP envelope (intended-use changes, population expansion, output/architecture changes, ' +
    'uncontrolled continuous learning) that need a new marketing submission. Returns per-modification envelope ' +
    'eligibility, the protocol, acceptance-criteria and filing guidance, and citations (FDA PCCP Guidance 2024, ' +
    'GMLP 2021, ISO 14971, IEC 62304, 21 CFR 820.30). An unstated scope fact is named, not read as false. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      deviceName: {
        type: 'string',
        description: 'Device / SaMD name or descriptor (optional).',
      },
      samdCategory: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description: 'IMDRF SaMD category, to scale the Modification Protocol rigor (optional).',
      },
      algorithmType: {
        type: 'string',
        enum: ['locked', 'adaptive', 'hybrid'],
        description: 'Algorithm behavior over the lifecycle (optional).' + NOT_READ,
      },
      plannedModifications: {
        type: 'array',
        description: 'The modifications to pre-authorize within the PCCP: at least one.',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Short label, e.g. "Periodic retraining on new sites".',
            },
            description: {
              type: 'string',
              description:
                'What changes (data, model, inputs, performance spec) and how it is implemented.',
            },
            type: {
              type: 'string',
              enum: [
                'retraining',
                'performance-improvement',
                'input-expansion',
                'output-change',
                'population-expansion',
                'architecture-change',
                'other',
              ],
              description:
                'Category of modification. "output-change", "population-expansion", and ' +
                '"architecture-change" generally fall outside a PCCP envelope.',
            },
          },
          required: ['label', 'description', 'type'],
        },
      },
      changesIntendedUse: {
        type: 'boolean',
        description:
          'Whether any modification changes the intended use / indications for use. If true, that ' +
          'modification CANNOT be authorized via a PCCP and requires a new marketing submission.' + SCOPE_NOT_STATED,
      },
      expandsPopulation: {
        type: 'boolean',
        description:
          'Whether any modification expands the patient population beyond the cleared one.' + SCOPE_NOT_STATED,
      },
      addsNewInputModality: {
        type: 'boolean',
        description:
          'Whether any modification introduces a new input type/modality (changes analytical ' +
          'validation needs).' + SCOPE_NOT_STATED,
      },
      continuousLearningProposed: {
        type: 'boolean',
        description:
          'Whether automated/continuous learning ("learning in the field") is proposed. Hard to ' +
          'bound within a PCCP; FDA generally expects controlled, verifiable updates with human ' +
          'oversight.' + SCOPE_NOT_STATED,
      },
    },
    required: ['plannedModifications'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_gmlp
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_GMLP: AnaTool = {
  name: 'assess_gmlp',
  description:
    'Assess conformity to the 10 Good Machine Learning Practice (GMLP) guiding principles (FDA / Health Canada / ' +
    'MHRA, 2021): (1) multi-disciplinary expertise, (2) good software engineering & security, (3) data ' +
    'representativeness, (4) train/test independence, (5) best-available reference standard, (6) model design ' +
    'tailored to data & intended use, (7) Human-AI team performance, (8) testing under clinically relevant ' +
    'conditions, (9) clear user information, (10) deployed-model monitoring & re-training risk. Returns ' +
    'per-principle conformity, a conformity score (0-100; null while a principle is not assessed), an overall ' +
    'verdict (then not_assessed unless one is non-conformant), the gaps by priority, and citations (GMLP 2021, ' +
    'FDA Transparency 2024, IEC 62304, ISO 14971, FDA PCCP 2024). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      principleInputs: {
        type: 'array',
        description:
          'Conformity self-assessment for each GMLP principle the user wishes to assess, each principle at ' +
          'most once ([] if none). Principles not provided are reported as "not-assessed".',
        items: {
          type: 'object',
          properties: {
            principle: {
              type: 'number',
              description: 'GMLP principle number, a whole number from 1 to 10.',
            },
            conformity: {
              type: 'string',
              enum: ['conformant', 'partial', 'non-conformant', 'not-assessed'],
              description:
                'Self-assessed conformity for this principle. "conformant" scores 1.0, "partial" 0.5 and ' +
                '"non-conformant" 0.0 toward the overall score; a "not-assessed" principle leaves the score null.',
            },
            evidence: {
              type: 'string',
              description: 'Optional supporting evidence note for this principle.',
            },
          },
          required: ['principle', 'conformity'],
        },
      },
      samdCategory: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description: 'IMDRF SaMD category for context (optional).' + NOT_READ,
      },
    },
    required: ['principleInputs'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. design_samd_clinical_validation
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_SAMD_CLINICAL_VALIDATION: AnaTool = {
  name: 'design_samd_clinical_validation',
  description:
    'Build an IMDRF N41 clinical evaluation / validation evidence plan for a SaMD, scaled to its IMDRF category ' +
    '(I-IV). Structures the evidence around the three N41 pillars: (1) Valid Clinical Association (is the output ' +
    'meaningful?), (2) Analytical/Technical Validation (does the SaMD process input correctly?), and (3) Clinical ' +
    'Validation (does using the output achieve the intended purpose?). Returns a numbered evidence plan, whether ' +
    'independent review of results is expected, study-design guidance (prospective vs. real-world data), ' +
    'performance-metrics guidance, an overall narrative, and citations (IMDRF N41/N12, GMLP 2021, IEC 62304, FDA ' +
    'Transparency 2024). For AI/ML SaMD it adds generalizability and subgroup/bias requirements. An unstated fact ' +
    'is named in the plan, not assumed. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      samdCategory: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description:
          'IMDRF SaMD category (from classify_samd). Drives the evidentiary rigor (standard / ' +
          'high / highest) and whether independent review of results is expected.',
      },
      validClinicalAssociationEstablished: {
        type: 'boolean',
        description:
          'Whether the underlying clinical association is already well-established in the ' +
          'literature/guidelines. If true, the engine recommends leveraging existing evidence ' +
          'for the first pillar. Omitted or null stays not_stated: that pillar\'s rigor is not_assessed.',
      },
      isAIML: {
        type: 'boolean',
        description:
          'Whether the SaMD is an AI/ML function. Adds analytical-generalizability and ' +
          'subgroup/bias evidence requirements (GMLP). Omitted or null stays not_stated, and the plan names it.',
      },
      intendedUse: {
        type: 'string',
        description: 'Free-text intended use / intended medical purpose (optional).' + NOT_READ,
      },
      referenceStandardAvailable: {
        type: 'boolean',
        description:
          'Whether an accepted reference standard / ground truth exists. If false, the plan adds ' +
          'a requirement to establish one using best-available methods (GMLP Principle 5). Omitted or null ' +
          'stays not_stated: the plan asks to confirm one exists.',
      },
      prospectiveDataPlanned: {
        type: 'boolean',
        description:
          'Whether clinical validation will use new prospective data (true) vs. retrospective / ' +
          'real-world data (false). Affects study-design guidance. Omitted or null stays not_stated, and the ' +
          'guidance says so.',
      },
      autonomyLevel: {
        type: 'string',
        enum: ['assistive', 'augmentative', 'autonomous'],
        description:
          'Level of autonomy. Determines whether stand-alone algorithm performance or Human-AI ' +
          'team performance is the primary clinical-validation evidence (optional; omitted, the plan names both).',
      },
    },
    required: ['samdCategory'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_device_cybersecurity
// ─────────────────────────────────────────────────────────────────────────────

/** An omitted artifact input is not stated (2026-10-26): it was read as provided. */
const CYBER_NOT_STATED_NOTE =
  'Omitted or null stays not_stated: it counts as a gap, never as provided. Leave it out if it is not known.';

export const ASSESS_DEVICE_CYBERSECURITY: AnaTool = {
  name: 'assess_device_cybersecurity',
  description:
    'Assess premarket cybersecurity for a device per the FDA September 2023 guidance and Section 524B of the FD&C ' +
    'Act: whether it is a "cyber device" (validated software, internet connection, vulnerable characteristics) ' +
    'that triggers 524B obligations. Evaluates the threat model, SBOM (NTIA minimum ' +
    'elements), security risk management (AAMI TIR57 / SW96), vulnerability handling, post-market update plan, ' +
    'sensitive-data protection and a Secure Product Development Framework. Returns per-requirement status and ' +
    'severity, guidance, an overall verdict, a critical-gap count, the facts not stated, and citations (Section ' +
    '524B, FDA Cybersecurity 2023, AAMI TIR57/SW96, ISO 14971, NTIA SBOM, IEC 81001-5-1). An unstated criterion ' +
    'leaves 524B undetermined unless another rules it out; an unstated artifact counts as a gap, never as ' +
    'provided. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      networkConnected: {
        type: 'boolean',
        description:
          'Whether the device can connect to the internet / a network / other devices or cloud. ' +
          'One of the "cyber device" criteria under Section 524B. Omitted or null stays not_stated: it ' +
          'is not assumed, and the cyber-device status is undetermined unless includesSoftware is false.',
      },
      includesSoftware: {
        type: 'boolean',
        description:
          'Whether the device includes or relies on validated software. One of the "cyber device" ' +
          'criteria under Section 524B. Omitted or null stays not_stated: it is not assumed, and the ' +
          'cyber-device status is undetermined unless networkConnected is false.',
      },
      submissionUnder524B: {
        type: 'boolean',
        description:
          'Whether the submission is on/after the Section 524B effective date (March 29, 2023; ' +
          'FDA refuse-to-accept from October 1, 2023). Omitted or null stays not_stated: it is not assumed, ' +
          'and applicability is undetermined unless the device is explicitly ruled out as a cyber device.',
      },
      threatModelProvided: {
        type: 'boolean',
        description:
          'Whether a threat model (e.g., STRIDE-based) covering the system, interfaces, trust ' +
          'boundaries, update path, and connected systems is provided. Set false to flag a gap. ' +
          CYBER_NOT_STATED_NOTE,
      },
      sbomProvided: {
        type: 'boolean',
        description:
          'Whether a Software Bill of Materials (SBOM) including commercial, open-source, and ' +
          'off-the-shelf components is provided [524B(b)(3)]. Missing or unstated is a critical ' +
          'gap unless 524B is explicitly ruled out. ' + CYBER_NOT_STATED_NOTE,
      },
      securityRiskManagementProvided: {
        type: 'boolean',
        description:
          'Whether security risk management per AAMI TIR57 / SW96 (distinct from ISO 14971 safety ' +
          'risk) is provided. Set false to flag a gap. ' + CYBER_NOT_STATED_NOTE,
      },
      vulnerabilityHandlingProcess: {
        type: 'boolean',
        description:
          'Whether coordinated vulnerability disclosure (CVD) / vulnerability handling processes ' +
          'are in place [524B(b)(1)]. Missing or unstated is a critical gap unless 524B is explicitly ruled out. ' +
          CYBER_NOT_STATED_NOTE,
      },
      postMarketUpdatePlan: {
        type: 'boolean',
        description:
          'Whether a post-market update/patch capability and plan exist [524B(b)(2)]. Missing or ' +
          'unstated is a critical gap unless 524B is explicitly ruled out. ' + CYBER_NOT_STATED_NOTE,
      },
      handlesSensitiveData: {
        type: 'boolean',
        description:
          'Whether the device processes or stores sensitive data (ePHI). If true, adds a data-' +
          'protection requirement (encryption at rest/in transit, access control, audit logging). Omitted or ' +
          'null stays not_stated: the requirement is listed as not stated, at attention, not as a gap.',
      },
      deviceName: {
        type: 'string',
        description: 'Device descriptor (optional).',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Digital Health, SaMD & AI/ML device tools, spread into ALL_ANA_TOOLS. */
export const DIGITAL_HEALTH_TOOLS: AnaTool[] = [
  CLASSIFY_SAMD,
  ASSESS_AI_ML_DEVICE,
  DESIGN_PCCP,
  ASSESS_GMLP,
  DESIGN_SAMD_CLINICAL_VALIDATION,
  ASSESS_DEVICE_CYBERSECURITY,
];
