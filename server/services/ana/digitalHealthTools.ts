/**
 * Digital Health, SaMD & AI/ML Device tools — exposes the deterministic
 * knowledge engines in `server/services/digital-health/digital-health-knowledge`
 * to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
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
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_samd
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_SAMD: AnaTool = {
  name: 'classify_samd',
  description:
    'Classify Software as a Medical Device (SaMD) into an IMDRF risk category (I-IV) using ' +
    'the IMDRF N12 framework: the state of the healthcare situation or condition ' +
    '(non-serious / serious / critical) crossed with the significance of the information the ' +
    'software provides to the clinical decision (inform / drive clinical management / treat or ' +
    'diagnose). Returns the matrix cell, the SaMD category and impact level, a risk narrative, ' +
    'the informationally-implied US device class and likely premarket pathway, QMS expectations ' +
    '(21 CFR 820.30 / QMSR, IEC 62304, ISO 14971, IMDRF N23), the clinical-evaluation rigor, a ' +
    'Clinical Decision Support (CDS) screen, and citations (IMDRF N10/N12/N41, FDA CDS Guidance ' +
    '2022). Use when the user needs to categorize a SaMD, understand its risk level, or scope ' +
    'the evidentiary burden for a digital-health product. ' + DETERMINISTIC_NOTE,
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
        description:
          'The SaMD definition statement / intended medical purpose (optional). Anchors the ' +
          'categorization and clinical evaluation.',
      },
      meetsSaMDDefinition: {
        type: 'boolean',
        description:
          'Whether the software meets the IMDRF SaMD definition (software intended for a medical ' +
          'purpose that performs that purpose without being part of a hardware medical device). ' +
          'Default true. If false, the engine notes it may be SiMD (software in a device).',
      },
      generalPurposePlatform: {
        type: 'boolean',
        description:
          'Whether the software runs on a general-purpose computing platform (vs. an embedded / ' +
          'non-general-purpose platform). Affects the SaMD-vs-SiMD note. Default true.',
      },
      targetPopulation: {
        type: 'string',
        description: 'Free-text description of the intended-use patient population (optional).',
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
    'Assess an AI/ML-enabled medical device software function: locked vs. adaptive (vs. hybrid) ' +
    'algorithm behavior, level of autonomy (assistive / augmentative / autonomous), transparency ' +
    'documentation, training-data representativeness and bias, generalizability / external ' +
    'validation, real-world performance monitoring, and whether a Predetermined Change Control ' +
    'Plan (PCCP) is appropriate. Returns an autonomy narrative, a PCCP recommendation with ' +
    'rationale, transparency / bias / monitoring findings, overall risk flags (including ' +
    'generative/foundation-model risks), prioritized recommended actions, and citations (FDA ' +
    'AI/ML Discussion Paper 2019 & Action Plan 2021, FDA PCCP Guidance 2024, GMLP 2021, FDA ' +
    'Transparency Guiding Principles 2024). Use when the user is evaluating an AI/ML device, ' +
    'deciding between a locked and adaptive design, or determining if a PCCP is needed. ' +
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
        description: 'IMDRF SaMD category (from classify_samd), for risk context (optional).',
      },
      transparencyArtifactsProvided: {
        type: 'boolean',
        description:
          'Whether user-facing transparency documentation (model card / device label: inputs, ' +
          'intended population, data provenance, subgroup performance, limitations, required ' +
          'oversight) is provided. Default treated as unknown unless set.',
      },
      trainingDataRepresentative: {
        type: 'boolean',
        description:
          'Whether the training data are demonstrably representative of the intended-use ' +
          'population (GMLP Principle 3). Set false to flag a bias/representativeness gap.',
      },
      externalValidationPerformed: {
        type: 'boolean',
        description:
          'Whether independent external / multi-site validation was performed (GMLP Principles 4 ' +
          '& 6). Set false to flag a generalizability gap.',
      },
      realWorldMonitoring: {
        type: 'boolean',
        description:
          'Whether post-deployment real-world performance monitoring is in place (GMLP Principle ' +
          '10). Set false to flag a monitoring gap.',
      },
      plannedPostMarketModifications: {
        type: 'boolean',
        description:
          'Whether the manufacturer intends to modify the model after clearance (retraining, ' +
          'performance improvements, expanded inputs). Drives the PCCP recommendation.',
      },
      intendedModifications: {
        type: 'string',
        description: 'Free-text description of intended post-market modifications (optional).',
      },
      usesGenerativeOrFoundationModel: {
        type: 'boolean',
        description:
          'Whether a generative or foundation-model component is involved. Adds risk flags for ' +
          'non-determinism, hallucination, opaque provenance, and a large/shifting input space.',
      },
    },
    required: ['algorithmType', 'autonomyLevel'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. design_pccp
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_PCCP: AnaTool = {
  name: 'design_pccp',
  description:
    'Design a Predetermined Change Control Plan (PCCP) for an AI/ML-enabled device per the FDA ' +
    'December 2024 guidance. Builds the three FDA-required components — (1) Description of ' +
    'Modifications, (2) Modification Protocol (data management, retraining practices, performance ' +
    'evaluation with pre-specified acceptance criteria, and update procedures), and (3) Impact ' +
    'Assessment — and flags modifications that fall OUTSIDE a PCCP envelope (intended-use changes, ' +
    'population expansion, output/architecture changes, uncontrolled continuous learning) that ' +
    'instead require a new marketing submission. Returns per-modification envelope eligibility, ' +
    'the full modification protocol, the impact assessment, acceptance-criteria guidance, filing ' +
    'guidance, and citations (FDA PCCP Guidance 2024, GMLP 2021, ISO 14971, IEC 62304, 21 CFR ' +
    '820.30). Use when the user wants to pre-authorize iterative AI/ML model updates without a ' +
    'new submission for each change. ' + DETERMINISTIC_NOTE,
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
        description: 'Algorithm behavior over the lifecycle (optional).',
      },
      plannedModifications: {
        type: 'array',
        description: 'The set of modifications to pre-authorize within the PCCP.',
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
          'modification CANNOT be authorized via a PCCP and requires a new marketing submission.',
      },
      expandsPopulation: {
        type: 'boolean',
        description:
          'Whether any modification expands the patient population beyond the cleared one.',
      },
      addsNewInputModality: {
        type: 'boolean',
        description:
          'Whether any modification introduces a new input type/modality (changes analytical ' +
          'validation needs).',
      },
      continuousLearningProposed: {
        type: 'boolean',
        description:
          'Whether automated/continuous learning ("learning in the field") is proposed. Hard to ' +
          'bound within a PCCP; FDA generally expects controlled, verifiable updates with human ' +
          'oversight.',
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
    'Assess conformity to the 10 Good Machine Learning Practice (GMLP) guiding principles ' +
    '(FDA / Health Canada / MHRA, October 2021): (1) multi-disciplinary expertise across the ' +
    'life cycle, (2) good software engineering & security, (3) data representativeness of the ' +
    'intended population, (4) train/test independence, (5) best-available reference standard, ' +
    '(6) model design tailored to data & intended use, (7) Human-AI team performance, (8) testing ' +
    'under clinically relevant conditions, (9) clear/essential user information, (10) deployed-' +
    'model monitoring & re-training risk management. Returns per-principle conformity, a ' +
    'deterministic overall conformity score (0-100), an overall verdict, prioritized gaps, and ' +
    'citations (GMLP 2021, FDA Transparency Guiding Principles 2024, IEC 62304, ISO 14971, FDA ' +
    'PCCP 2024). Use when the user wants a GMLP gap analysis for an AI/ML device. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      principleInputs: {
        type: 'array',
        description:
          'Conformity self-assessment for each GMLP principle the user wishes to assess. ' +
          'Principles not provided are reported as "not-assessed".',
        items: {
          type: 'object',
          properties: {
            principle: {
              type: 'number',
              description: 'GMLP principle number (1-10).',
            },
            conformity: {
              type: 'string',
              enum: ['conformant', 'partial', 'non-conformant', 'not-assessed'],
              description:
                'Self-assessed conformity for this principle. "conformant" scores 1.0, "partial" ' +
                '0.5, "non-conformant"/"not-assessed" 0.0 toward the overall score.',
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
        description: 'IMDRF SaMD category for context (optional).',
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
    'Build an IMDRF N41 clinical evaluation / validation evidence plan for a SaMD, scaled to its ' +
    'IMDRF risk category (I-IV). Structures the evidence around the three N41 pillars — (1) Valid ' +
    'Clinical Association (is the output meaningful?), (2) Analytical/Technical Validation (does ' +
    'the SaMD process input correctly?), and (3) Clinical Validation (does using the output ' +
    'achieve the intended purpose?) — and returns a numbered evidence plan, whether independent ' +
    'review of results is expected, study-design guidance (prospective vs. real-world data), ' +
    'performance-metrics guidance (operating characteristic, subgroup stratification, stand-alone ' +
    'vs. Human-AI team performance), an overall narrative, and citations (IMDRF N41/N12, GMLP ' +
    '2021, IEC 62304, FDA Transparency 2024). For AI/ML SaMD it adds generalizability and ' +
    'subgroup/bias requirements. Use when the user needs to scope the clinical evidence for a ' +
    'SaMD. ' + DETERMINISTIC_NOTE,
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
          'for the first pillar.',
      },
      isAIML: {
        type: 'boolean',
        description:
          'Whether the SaMD is an AI/ML function. Adds analytical-generalizability and ' +
          'subgroup/bias evidence requirements (GMLP).',
      },
      intendedUse: {
        type: 'string',
        description: 'Free-text intended use / intended medical purpose (optional).',
      },
      referenceStandardAvailable: {
        type: 'boolean',
        description:
          'Whether an accepted reference standard / ground truth exists. If false, the plan adds ' +
          'a requirement to establish one using best-available methods (GMLP Principle 5).',
      },
      prospectiveDataPlanned: {
        type: 'boolean',
        description:
          'Whether clinical validation will use new prospective data (true) vs. retrospective / ' +
          'real-world data (false). Affects study-design guidance.',
      },
      autonomyLevel: {
        type: 'string',
        enum: ['assistive', 'augmentative', 'autonomous'],
        description:
          'Level of autonomy. Determines whether stand-alone algorithm performance or Human-AI ' +
          'team performance is the primary clinical-validation evidence (optional).',
      },
    },
    required: ['samdCategory'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_device_cybersecurity
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_DEVICE_CYBERSECURITY: AnaTool = {
  name: 'assess_device_cybersecurity',
  description:
    'Assess premarket cybersecurity for a device software function per the FDA September 2023 ' +
    'guidance and Section 524B of the FD&C Act. Determines whether the device meets the "cyber ' +
    'device" definition (includes validated software, can connect to the internet, and has ' +
    'characteristics vulnerable to cybersecurity threats) and therefore triggers 524B obligations ' +
    '(post-market vulnerability monitoring plan & coordinated disclosure, secure update/patch ' +
    'capability, and a Software Bill of Materials). Evaluates the threat model, SBOM (NTIA minimum ' +
    'elements), security risk management (AAMI TIR57 / SW96, distinct from ISO 14971 safety risk), ' +
    'coordinated vulnerability disclosure / handling, post-market update plan, sensitive-data ' +
    'protection, and a Secure Product Development Framework. Returns per-requirement status and ' +
    'severity, threat-modeling / SBOM / security-risk-management / vulnerability-handling ' +
    'guidance, an overall verdict, a critical-gap count, and citations (Section 524B, FDA ' +
    'Cybersecurity 2023, AAMI TIR57/SW96, ISO 14971, NTIA SBOM, IEC 81001-5-1, 21 CFR 820.30). ' +
    'Use when the user needs a premarket cybersecurity gap analysis or to confirm 524B ' +
    'applicability. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      networkConnected: {
        type: 'boolean',
        description:
          'Whether the device can connect to the internet / a network / other devices or cloud. ' +
          'One of the "cyber device" criteria under Section 524B. Default true.',
      },
      includesSoftware: {
        type: 'boolean',
        description:
          'Whether the device includes or relies on validated software. One of the "cyber device" ' +
          'criteria under Section 524B. Default true.',
      },
      submissionUnder524B: {
        type: 'boolean',
        description:
          'Whether the submission is on/after the Section 524B effective date (March 29, 2023; ' +
          'FDA refuse-to-accept from October 1, 2023). Default true.',
      },
      threatModelProvided: {
        type: 'boolean',
        description:
          'Whether a threat model (e.g., STRIDE-based) covering the system, interfaces, trust ' +
          'boundaries, update path, and connected systems is provided. Set false to flag a gap.',
      },
      sbomProvided: {
        type: 'boolean',
        description:
          'Whether a Software Bill of Materials (SBOM) including commercial, open-source, and ' +
          'off-the-shelf components is provided [524B(b)(3)]. Set false to flag a (critical when ' +
          '524B applies) gap.',
      },
      securityRiskManagementProvided: {
        type: 'boolean',
        description:
          'Whether security risk management per AAMI TIR57 / SW96 (distinct from ISO 14971 safety ' +
          'risk) is provided. Set false to flag a gap.',
      },
      vulnerabilityHandlingProcess: {
        type: 'boolean',
        description:
          'Whether coordinated vulnerability disclosure (CVD) / vulnerability handling processes ' +
          'are in place [524B(b)(1)]. Set false to flag a (critical when 524B applies) gap.',
      },
      postMarketUpdatePlan: {
        type: 'boolean',
        description:
          'Whether a post-market update/patch capability and plan exist [524B(b)(2)]. Set false to ' +
          'flag a (critical when 524B applies) gap.',
      },
      handlesSensitiveData: {
        type: 'boolean',
        description:
          'Whether the device processes or stores sensitive data (ePHI). If true, adds a data-' +
          'protection requirement (encryption at rest/in transit, access control, audit logging).',
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
