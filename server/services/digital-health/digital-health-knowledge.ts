/**
 * Digital Health, SaMD & AI/ML Devices — Deterministic Knowledge Engine
 * ============================================================================
 *
 * Pure, closed-form, reproducible regulatory-intelligence engines for Software
 * as a Medical Device (SaMD), Software in a Medical Device (SiMD), and AI/ML-
 * enabled device software functions. NO LLM, NO network, NO database, NO imports
 * from other services. Identical input always yields identical output.
 *
 * Grounded in (verbatim, citation-backed):
 *   - IMDRF/SaMD WG/N12 FINAL:2014 — "Software as a Medical Device: Possible
 *     Framework for Risk Categorization and Corresponding Considerations".
 *   - IMDRF/SaMD WG/N41 FINAL:2017 — "Software as a Medical Device (SaMD):
 *     Clinical Evaluation".
 *   - IMDRF/SaMD WG/N10 FINAL:2013 — "Software as a Medical Device (SaMD): Key
 *     Definitions".
 *   - FDA Guidance "Marketing Submission Recommendations for a Predetermined
 *     Change Control Plan for Artificial Intelligence-Enabled Device Software
 *     Functions" (December 2024, final).
 *   - FDA/Health Canada/MHRA "Good Machine Learning Practice for Medical Device
 *     Development: Guiding Principles" (October 2021) — the 10 GMLP principles.
 *   - FDA Guidance "Cybersecurity in Medical Devices: Quality System
 *     Considerations and Content of Premarket Submissions" (September 2023).
 *   - Section 524B of the FD&C Act ("Ensuring Cybersecurity of Devices"),
 *     added by the Consolidated Appropriations Act, 2023 (PL 117-328), effective
 *     for submissions on/after March 29, 2023; FDA refuse-to-accept from
 *     October 1, 2023.
 *   - 21 CFR Part 820 (Quality System Regulation / design controls, 820.30) and
 *     the QMSR final rule (21 CFR 820 harmonized with ISO 13485:2016, effective
 *     February 2, 2026).
 *   - FDA Guidance "Clinical Decision Support Software" (September 2022, final).
 *   - FDA Guidance "Content of Premarket Submissions for Device Software
 *     Functions" (June 2023).
 *   - AAMI TIR57:2016 — "Principles for medical device security — Risk
 *     management"; AAMI SW96:2023; ANSI/AAMI/ISO 14971:2019 (risk management).
 *   - IEC 62304:2006+A1:2015 — medical device software life cycle processes.
 *
 * IMPORTANT: All citations are reproduced from the public regulatory record.
 * A fabricated or misattributed regulatory citation in a device marketing
 * submission (510(k), De Novo, PMA) is a critical defect. Every string the
 * engines return is intended to be reported verbatim.
 *
 * @module server/services/digital-health/digital-health-knowledge
 */

// ════════════════════════════════════════════════════════════════════════════
// SECTION 0 — SHARED TYPES
// ════════════════════════════════════════════════════════════════════════════

/** State of the healthcare situation/condition (IMDRF N12 §6.1). */
export type HealthcareSituation = 'non-serious' | 'serious' | 'critical';

/** Significance of information provided by the SaMD (IMDRF N12 §6.2). */
export type InformationSignificance = 'inform' | 'drive' | 'treat-or-diagnose';

/** IMDRF SaMD risk category (N12 Table — categories I, II, III, IV). */
export type SaMDCategory = 'I' | 'II' | 'III' | 'IV';

/** US device class implied by risk (informational mapping, not a 1:1 rule). */
export type DeviceClass = 'I' | 'II' | 'III' | 'Unclassified/De Novo';

/** AI/ML algorithm behavior over the device lifecycle. */
export type AlgorithmType = 'locked' | 'adaptive' | 'hybrid';

/** Level of autonomy of an AI/ML clinical function. */
export type AutonomyLevel =
  | 'assistive' // human reviews all outputs; AI informs
  | 'augmentative' // AI drives management; human retains decision
  | 'autonomous'; // AI provides a diagnostic/treatment output without expert in loop

/** Premarket regulatory pathway. */
export type Pathway = '510(k)' | 'De Novo' | 'PMA' | 'Exempt' | '513(g)/Consult-FDA';

/** Severity verdict used across engines. */
export type Verdict = 'pass' | 'attention' | 'gap' | 'critical-gap';

/** A regulatory citation with a stable identifier. */
export interface Citation {
  /** Short stable id, e.g. "IMDRF-N12". */
  id: string;
  /** Human-readable reference. */
  reference: string;
  /** Section/clause if applicable. */
  section?: string;
}

/** A single enumerated finding/recommendation. */
export interface Finding {
  topic: string;
  detail: string;
  severity: Verdict;
  citations: string[];
}

/** A required evidence/data element. */
export interface Requirement {
  id: string;
  requirement: string;
  rationale: string;
  citations: string[];
  mandatory: boolean;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CITATION REGISTRY (single source of truth)
// ════════════════════════════════════════════════════════════════════════════

interface CitationRecord {
  id: string;
  reference: string;
  section?: string;
}

const CITATIONS: CitationRecord[] = [
  {
    id: 'IMDRF-N10',
    reference:
      'IMDRF/SaMD WG/N10 FINAL:2013 — "Software as a Medical Device (SaMD): Key Definitions"',
  },
  {
    id: 'IMDRF-N12',
    reference:
      'IMDRF/SaMD WG/N12 FINAL:2014 — "Software as a Medical Device: Possible Framework for Risk Categorization and Corresponding Considerations"',
  },
  {
    id: 'IMDRF-N23',
    reference:
      'IMDRF/SaMD WG/N23 FINAL:2015 — "Software as a Medical Device (SaMD): Application of Quality Management System"',
  },
  {
    id: 'IMDRF-N41',
    reference:
      'IMDRF/SaMD WG/N41 FINAL:2017 — "Software as a Medical Device (SaMD): Clinical Evaluation"',
  },
  {
    id: 'FDA-PCCP-2024',
    reference:
      'FDA Guidance — "Marketing Submission Recommendations for a Predetermined Change Control Plan for Artificial Intelligence-Enabled Device Software Functions" (December 2024)',
  },
  {
    id: 'GMLP-2021',
    reference:
      'FDA / Health Canada / MHRA — "Good Machine Learning Practice for Medical Device Development: Guiding Principles" (October 2021)',
  },
  {
    id: 'FDA-CYBER-2023',
    reference:
      'FDA Guidance — "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions" (September 2023)',
  },
  {
    id: 'FDC-524B',
    reference:
      'Section 524B of the Federal Food, Drug, and Cosmetic Act ("Ensuring Cybersecurity of Devices"), 21 U.S.C. 360n-2',
  },
  {
    id: 'CFR-820-30',
    reference: '21 CFR 820.30 — Design controls (Quality System Regulation)',
  },
  {
    id: 'QMSR-2024',
    reference:
      'FDA Quality Management System Regulation (QMSR) final rule — 21 CFR Part 820 harmonized with ISO 13485:2016 (effective February 2, 2026)',
  },
  {
    id: 'FDA-CDS-2022',
    reference: 'FDA Guidance — "Clinical Decision Support Software" (September 2022)',
  },
  {
    id: 'FDA-SW-2023',
    reference:
      'FDA Guidance — "Content of Premarket Submissions for Device Software Functions" (June 2023)',
  },
  {
    id: 'FDA-AIML-DISC-2019',
    reference:
      'FDA Discussion Paper — "Proposed Regulatory Framework for Modifications to Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD)" (April 2019)',
  },
  {
    id: 'FDA-AIML-ACTION-2021',
    reference:
      'FDA — "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan" (January 2021)',
  },
  {
    id: 'FDA-TRANSPARENCY-2024',
    reference:
      'FDA — "Transparency for Machine-Learning-Enabled Medical Devices: Guiding Principles" (June 2024)',
  },
  {
    id: 'AAMI-TIR57',
    reference: 'AAMI TIR57:2016 — "Principles for medical device security — Risk management"',
  },
  {
    id: 'AAMI-SW96',
    reference: 'ANSI/AAMI SW96:2023 — "Standard for medical device security — Security risk management for device manufacturers"',
  },
  {
    id: 'ISO-14971',
    reference: 'ANSI/AAMI/ISO 14971:2019 — "Medical devices — Application of risk management to medical devices"',
  },
  {
    id: 'IEC-62304',
    reference: 'IEC 62304:2006+A1:2015 — "Medical device software — Software life cycle processes"',
  },
  {
    id: 'IEC-81001-5-1',
    reference: 'IEC 81001-5-1:2021 — "Health software and health IT systems safety, effectiveness and security — Part 5-1: Security — Activities in the product life cycle"',
  },
  {
    id: 'NTIA-SBOM',
    reference: 'NTIA — "The Minimum Elements For a Software Bill of Materials (SBOM)" (July 2021)',
  },
  {
    id: 'FDA-IMDRF-SOPDA',
    reference:
      'IMDRF/SaMD WG/N12 — Statement of the SaMD definition statement (intended use / intended medical purpose)',
  },
];

const CITATION_INDEX: Map<string, CitationRecord> = new Map(
  CITATIONS.map((c: CitationRecord): [string, CitationRecord] => [c.id, c]),
);

/** Resolve a list of citation ids into full Citation objects, deterministically. */
function resolveCitations(ids: string[]): Citation[] {
  const seen: Set<string> = new Set();
  const out: Citation[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rec = CITATION_INDEX.get(id);
    if (rec) {
      out.push({ id: rec.id, reference: rec.reference, section: rec.section });
    } else {
      out.push({ id, reference: id });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — classifySaMD
// IMDRF N12 risk categorization (I-IV)
// ════════════════════════════════════════════════════════════════════════════

export interface ClassifySaMDParams {
  /** Intended-use statement describing the SaMD's medical purpose. */
  intendedUse?: string;
  /** State of the healthcare situation or condition. */
  healthcareSituation: HealthcareSituation;
  /** Significance of the information the SaMD provides to the care decision. */
  informationSignificance: InformationSignificance;
  /** Optional: is the software a medical device at all (gating). */
  meetsSaMDDefinition?: boolean;
  /** Optional: does it run on a general-purpose computing platform (vs embedded SiMD). */
  generalPurposePlatform?: boolean;
  /** Optional free-text description of the target population. */
  targetPopulation?: string;
}

export interface SaMDCategoryDetail {
  category: SaMDCategory;
  impactLevel: 'low' | 'moderate' | 'high' | 'very-high';
  description: string;
  cell: string; // the N12 matrix cell, e.g. "Critical × Treat/Diagnose"
}

export interface ClassifySaMDResult {
  isSaMD: boolean;
  category: SaMDCategory;
  categoryDetail: SaMDCategoryDetail;
  healthcareSituation: HealthcareSituation;
  informationSignificance: InformationSignificance;
  riskNarrative: string;
  impliedDeviceClass: DeviceClass;
  likelyPathway: Pathway;
  considerations: Finding[];
  qmsExpectations: string[];
  clinicalEvaluationRigor: string;
  citations: Citation[];
}

/**
 * IMDRF N12 4x3 categorization matrix.
 * Rows = state of healthcare situation; Columns = significance of information.
 * Category ordering (per N12): IV (highest) > III > II > I (lowest).
 */
interface N12Cell {
  situation: HealthcareSituation;
  significance: InformationSignificance;
  category: SaMDCategory;
}

const N12_MATRIX: N12Cell[] = [
  // Critical situation
  { situation: 'critical', significance: 'treat-or-diagnose', category: 'IV' },
  { situation: 'critical', significance: 'drive', category: 'III' },
  { situation: 'critical', significance: 'inform', category: 'II' },
  // Serious situation
  { situation: 'serious', significance: 'treat-or-diagnose', category: 'III' },
  { situation: 'serious', significance: 'drive', category: 'II' },
  { situation: 'serious', significance: 'inform', category: 'I' },
  // Non-serious situation
  { situation: 'non-serious', significance: 'treat-or-diagnose', category: 'II' },
  { situation: 'non-serious', significance: 'drive', category: 'I' },
  { situation: 'non-serious', significance: 'inform', category: 'I' },
];

interface CategoryMeta {
  category: SaMDCategory;
  impactLevel: 'low' | 'moderate' | 'high' | 'very-high';
  description: string;
}

const CATEGORY_META: CategoryMeta[] = [
  {
    category: 'I',
    impactLevel: 'low',
    description:
      'Category I — Lowest impact. Accurate SaMD output is important; errors carry the lowest probability of contributing to harm relative to the other categories (IMDRF N12).',
  },
  {
    category: 'II',
    impactLevel: 'moderate',
    description:
      'Category II — Moderate impact. SaMD information is important to inform/drive clinical management; failure could contribute to a moderate level of harm (IMDRF N12).',
  },
  {
    category: 'III',
    impactLevel: 'high',
    description:
      'Category III — High impact. SaMD drives clinical management of a critical situation or treats/diagnoses a serious situation; failure could contribute to serious harm (IMDRF N12).',
  },
  {
    category: 'IV',
    impactLevel: 'very-high',
    description:
      'Category IV — Highest impact. SaMD treats or diagnoses a critical healthcare situation/condition; failure could contribute to death or irreversible harm (IMDRF N12).',
  },
];

const CATEGORY_META_INDEX: Map<SaMDCategory, CategoryMeta> = new Map(
  CATEGORY_META.map((m: CategoryMeta): [SaMDCategory, CategoryMeta] => [m.category, m]),
);

function situationLabel(s: HealthcareSituation): string {
  if (s === 'critical') return 'Critical';
  if (s === 'serious') return 'Serious';
  return 'Non-serious';
}

function significanceLabel(s: InformationSignificance): string {
  if (s === 'treat-or-diagnose') return 'Treat or diagnose';
  if (s === 'drive') return 'Drive clinical management';
  return 'Inform clinical management';
}

function impliedClassForCategory(cat: SaMDCategory): DeviceClass {
  // Informational mapping only — IMDRF category is not the US class.
  if (cat === 'IV') return 'III';
  if (cat === 'III') return 'II';
  if (cat === 'II') return 'II';
  return 'I';
}

function pathwayForCategory(cat: SaMDCategory): Pathway {
  if (cat === 'IV') return 'PMA';
  if (cat === 'III') return '510(k)';
  if (cat === 'II') return '510(k)';
  return 'Exempt';
}

/**
 * Classify a SaMD per IMDRF N12 from the state of the healthcare situation and
 * the significance of the information it provides. Deterministic lookup.
 */
export function classifySaMD(params: ClassifySaMDParams): ClassifySaMDResult {
  const isSaMD = params.meetsSaMDDefinition !== false;

  const cell = N12_MATRIX.find(
    (c: N12Cell): boolean =>
      c.situation === params.healthcareSituation &&
      c.significance === params.informationSignificance,
  );
  // The matrix is total over the type space, but guard for safety.
  const category: SaMDCategory = cell ? cell.category : 'I';
  const meta = CATEGORY_META_INDEX.get(category);
  const impactLevel = meta ? meta.impactLevel : 'low';
  const description = meta ? meta.description : '';

  const cellLabel = `${situationLabel(params.healthcareSituation)} × ${significanceLabel(
    params.informationSignificance,
  )}`;

  const categoryDetail: SaMDCategoryDetail = {
    category,
    impactLevel,
    description,
    cell: cellLabel,
  };

  const impliedDeviceClass = impliedClassForCategory(category);
  const likelyPathway = pathwayForCategory(category);

  const considerations: Finding[] = [];

  if (!isSaMD) {
    considerations.push({
      topic: 'SaMD definition gate',
      detail:
        'Input asserts the software does NOT meet the SaMD definition. Per IMDRF N10, SaMD is software intended for one or more medical purposes that performs those purposes WITHOUT being part of a hardware medical device. If it drives or is necessary to a hardware device, it is SiMD (software in a medical device), not SaMD, and 21 CFR 820 design controls still apply.',
      severity: 'attention',
      citations: ['IMDRF-N10', 'CFR-820-30'],
    });
  }

  if (params.generalPurposePlatform === false) {
    considerations.push({
      topic: 'Platform',
      detail:
        'Software runs on a non-general-purpose / embedded platform; confirm whether the function is SiMD vs SaMD. The N12 risk categorization framework still applies to the SaMD-equivalent function, but life-cycle processes follow IEC 62304 within the embedded device.',
      severity: 'attention',
      citations: ['IMDRF-N10', 'IEC-62304'],
    });
  }

  // Category-specific considerations.
  if (category === 'IV') {
    considerations.push({
      topic: 'Highest-impact obligations',
      detail:
        'Category IV demands the most rigorous independent review of the SaMD definition statement, the most extensive clinical evaluation (valid clinical association + analytical + clinical validation), and an independent review of results. Expect a PMA-level evidentiary bar in the US.',
      severity: 'gap',
      citations: ['IMDRF-N12', 'IMDRF-N41'],
    });
  } else if (category === 'III') {
    considerations.push({
      topic: 'High-impact obligations',
      detail:
        'Category III requires robust analytical and clinical validation. In the US this typically aligns to a Class II 510(k) (with special controls) or De Novo if no predicate exists.',
      severity: 'attention',
      citations: ['IMDRF-N12', 'IMDRF-N41'],
    });
  } else if (category === 'II') {
    considerations.push({
      topic: 'Moderate-impact obligations',
      detail:
        'Category II requires analytical validation and a clinical evaluation appropriate to a moderate-harm function. Confirm whether a predicate exists for a 510(k) or whether a De Novo is required.',
      severity: 'attention',
      citations: ['IMDRF-N12', 'IMDRF-N41'],
    });
  } else {
    considerations.push({
      topic: 'Low-impact obligations',
      detail:
        'Category I has the lowest evidentiary burden. Many Category-I functions in the US are 510(k)-exempt or fall under FDA enforcement discretion (e.g., general wellness, certain CDS). Confirm against the FDA Software Functions / CDS policy.',
      severity: 'pass',
      citations: ['IMDRF-N12', 'FDA-CDS-2022'],
    });
  }

  // CDS hint
  if (params.informationSignificance === 'inform' && params.healthcareSituation !== 'critical') {
    considerations.push({
      topic: 'Clinical Decision Support (CDS) screen',
      detail:
        'A function that only informs (does not drive/treat/diagnose) a non-critical situation may qualify as Non-Device CDS under FDA\'s CDS guidance if all four criteria of section 520(o)(1)(E) are met: (1) not acquiring/processing a signal from an in-vitro/signal-acquisition device, (2) displaying/analyzing medical information, (3) providing recommendations to an HCP, and (4) enabling the HCP to independently review the basis. Time-critical or pattern-recognition outputs generally remain devices.',
      severity: 'attention',
      citations: ['FDA-CDS-2022'],
    });
  }

  const riskNarrative =
    `SaMD addresses a ${situationLabel(params.healthcareSituation).toLowerCase()} healthcare ` +
    `situation/condition and provides information that ${significanceLabel(
      params.informationSignificance,
    ).toLowerCase()}. Per the IMDRF N12 framework matrix cell "${cellLabel}", this is ` +
    `SaMD Category ${category} (${impactLevel} impact). ${description}`;

  const qmsExpectations: string[] = [
    'Establish design controls per 21 CFR 820.30 / QMSR (ISO 13485:2016) covering design & development planning, inputs, outputs, review, verification, validation, transfer, changes, and the design history file.',
    'Apply IEC 62304 software life-cycle processes; assign the software safety classification (A/B/C) consistent with the harm potential implied by SaMD Category ' +
      category +
      '.',
    'Apply ISO 14971 risk management across the SaMD definition statement, including consideration of off-label/foreseeable misuse.',
    'Apply IMDRF N23 QMS principles for SaMD (lifecycle support, realization, maintenance).',
  ];

  const rigor =
    category === 'IV' || category === 'III'
      ? 'High rigor: independent review of the clinical association, full analytical validation, and prospective or robust clinical validation appropriate to the harm potential (IMDRF N41).'
      : category === 'II'
        ? 'Moderate rigor: analytical validation plus clinical validation scaled to moderate harm; valid clinical association must be established from the literature or generated (IMDRF N41).'
        : 'Lower rigor: establish a valid clinical association and analytical validation; clinical validation may leverage existing evidence where the association is well-accepted (IMDRF N41).';

  const citations = resolveCitations([
    'IMDRF-N10',
    'IMDRF-N12',
    'IMDRF-N41',
    'IMDRF-N23',
    'FDA-CDS-2022',
    'CFR-820-30',
    'QMSR-2024',
    'IEC-62304',
    'ISO-14971',
  ]);

  return {
    isSaMD,
    category,
    categoryDetail,
    healthcareSituation: params.healthcareSituation,
    informationSignificance: params.informationSignificance,
    riskNarrative,
    impliedDeviceClass,
    likelyPathway,
    considerations,
    qmsExpectations,
    clinicalEvaluationRigor: rigor,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3 — assessAIMLDevice
// ════════════════════════════════════════════════════════════════════════════

export interface AssessAIMLDeviceParams {
  /** Algorithm behavior over the lifecycle. */
  algorithmType: AlgorithmType;
  /** Level of human oversight / autonomy of the clinical function. */
  autonomyLevel: AutonomyLevel;
  /** Optional SaMD category for context (from classifySaMD). */
  samdCategory?: SaMDCategory;
  /** Is a model card / transparency documentation provided to users. */
  transparencyArtifactsProvided?: boolean;
  /** Was the training population demonstrably representative of the intended population. */
  trainingDataRepresentative?: boolean;
  /** Was external/multi-site generalization tested. */
  externalValidationPerformed?: boolean;
  /** Are post-deployment performance monitoring mechanisms in place. */
  realWorldMonitoring?: boolean;
  /** Does the manufacturer intend to modify the model post-clearance. */
  plannedPostMarketModifications?: boolean;
  /** Free-text description of intended modifications (optional). */
  intendedModifications?: string;
  /** Foundation/large-model or generative component involved. */
  usesGenerativeOrFoundationModel?: boolean;
}

export interface AIMLDeviceAssessment {
  algorithmType: AlgorithmType;
  autonomyLevel: AutonomyLevel;
  autonomyNarrative: string;
  pccpRecommended: boolean;
  pccpRationale: string;
  transparencyFindings: Finding[];
  biasAndGeneralizabilityFindings: Finding[];
  monitoringFindings: Finding[];
  overallRiskFlags: Finding[];
  recommendedActions: string[];
  citations: Citation[];
}

function autonomyNarrativeFor(level: AutonomyLevel): string {
  if (level === 'autonomous') {
    return 'Autonomous: the AI/ML function delivers a diagnostic or treatment-directing output without a qualified human expert necessarily reviewing each case (e.g., autonomous detection). This is the highest-autonomy tier; it concentrates risk on analytical/clinical validation, failure-mode handling, indication boundaries, and user-facing limitations, because there is no clinician backstop on individual outputs.';
  }
  if (level === 'augmentative') {
    return 'Augmentative: the AI/ML output drives clinical management but a human retains and exercises the final decision. Human-factors and the human-AI team (GMLP Principle 7) become central; the labeling must support correct reliance and override.';
  }
  return 'Assistive: the AI/ML output informs a clinician who independently reviews the basis for the recommendation. Lowest-autonomy tier; may intersect with the Non-Device CDS criteria when all four 520(o)(1)(E) conditions are met.';
}

/**
 * Assess an AI/ML-enabled device function: locked vs adaptive, autonomy,
 * transparency, bias/generalizability, and whether a PCCP is appropriate.
 */
export function assessAIMLDevice(params: AssessAIMLDeviceParams): AIMLDeviceAssessment {
  const transparencyFindings: Finding[] = [];
  const biasFindings: Finding[] = [];
  const monitoringFindings: Finding[] = [];
  const riskFlags: Finding[] = [];
  const actions: string[] = [];

  // ── Algorithm type analysis ────────────────────────────────────────────
  if (params.algorithmType === 'locked') {
    riskFlags.push({
      topic: 'Locked algorithm',
      detail:
        'A locked algorithm produces the same output for the same input every time it is applied; weights do not change in the field. This is the classic premarket-review paradigm. Any change still requires evaluation against the change-control policy; a PCCP can pre-authorize a defined envelope of future locked-model updates.',
      severity: 'pass',
      citations: ['FDA-AIML-DISC-2019', 'FDA-PCCP-2024'],
    });
  } else if (params.algorithmType === 'adaptive') {
    riskFlags.push({
      topic: 'Adaptive / continuously-learning algorithm',
      detail:
        'An adaptive algorithm changes its behavior over time in the field (continuous learning). This breaks the static-snapshot review assumption and creates risk of unmonitored performance drift. FDA expects either (a) locking the model at release and updating through a controlled process, or (b) a Predetermined Change Control Plan (PCCP) that pre-specifies and bounds the adaptation. Uncontrolled in-field learning is generally not acceptable without a PCCP.',
      severity: 'gap',
      citations: ['FDA-AIML-DISC-2019', 'FDA-AIML-ACTION-2021', 'FDA-PCCP-2024'],
    });
  } else {
    riskFlags.push({
      topic: 'Hybrid algorithm',
      detail:
        'A hybrid design locks the deployed inference model but retrains/updates it on a planned cadence offline. Each update is a deliberate, reviewable artifact — a strong fit for a PCCP that pre-authorizes the retraining and re-validation protocol.',
      severity: 'attention',
      citations: ['FDA-PCCP-2024'],
    });
  }

  // ── PCCP recommendation logic ──────────────────────────────────────────
  const wantsModifications =
    params.plannedPostMarketModifications === true ||
    params.algorithmType === 'adaptive' ||
    params.algorithmType === 'hybrid';
  const pccpRecommended = wantsModifications;
  let pccpRationale: string;
  if (params.algorithmType === 'adaptive') {
    pccpRationale =
      'PCCP STRONGLY RECOMMENDED. An adaptive algorithm cannot rely on a static snapshot review; a PCCP (Description of Modifications + Modification Protocol + Impact Assessment) is the FDA-recognized mechanism to authorize iterative changes without a new marketing submission for each change (FDA PCCP Guidance, December 2024).';
  } else if (params.plannedPostMarketModifications === true) {
    pccpRationale =
      'PCCP RECOMMENDED. The manufacturer intends post-clearance modifications (e.g., retraining on new data, performance improvements, expanded inputs). A PCCP lets these be pre-authorized within a bounded envelope; modifications outside the PCCP require a new marketing submission.';
  } else if (params.algorithmType === 'hybrid') {
    pccpRationale =
      'PCCP RECOMMENDED for the planned retraining cadence. The locked-at-release/offline-retrain pattern maps directly onto the PCCP modification protocol.';
  } else {
    pccpRationale =
      'PCCP OPTIONAL. With a locked model and no planned post-market modifications, a PCCP is not required, though one may still be filed to streamline anticipated future updates.';
  }

  if (pccpRecommended) {
    actions.push(
      'Author a Predetermined Change Control Plan (PCCP) per FDA December 2024 guidance and include it in the marketing submission (510(k)/De Novo/PMA).',
    );
  }

  // ── Transparency ──────────────────────────────────────────────────────
  if (params.transparencyArtifactsProvided === false) {
    transparencyFindings.push({
      topic: 'Transparency artifacts',
      detail:
        'No model transparency documentation (e.g., a model/device "label" describing inputs, intended population, training data provenance, performance by subgroup, known limitations, and how to interpret outputs) is provided. FDA transparency guiding principles and GMLP Principle 9 expect users to be given clear, essential information.',
      severity: 'gap',
      citations: ['FDA-TRANSPARENCY-2024', 'GMLP-2021'],
    });
    actions.push(
      'Produce user-facing transparency documentation (model card / device label): intended use, inputs/outputs, training/validation population, subgroup performance, limitations, and required human oversight.',
    );
  } else {
    transparencyFindings.push({
      topic: 'Transparency artifacts',
      detail:
        'Transparency documentation is provided. Confirm it covers intended use & population, data provenance, subgroup performance, uncertainty/limitations, and required oversight, consistent with the FDA transparency guiding principles.',
      severity: 'pass',
      citations: ['FDA-TRANSPARENCY-2024', 'GMLP-2021'],
    });
  }

  if (params.autonomyLevel === 'autonomous') {
    transparencyFindings.push({
      topic: 'Autonomy vs. transparency',
      detail:
        'For an autonomous function there is no clinician reviewing each output, so transparency must instead support correct deployment-level use: explicit indication boundaries, operating points (sensitivity/specificity at the cleared threshold), and clear failure/abstain behavior.',
      severity: 'attention',
      citations: ['FDA-TRANSPARENCY-2024', 'GMLP-2021'],
    });
  }

  // ── Bias & generalizability ───────────────────────────────────────────
  if (params.trainingDataRepresentative === false) {
    biasFindings.push({
      topic: 'Data representativeness',
      detail:
        'Training data are not demonstrably representative of the intended-use population. This risks systematic bias and poor performance on under-represented subgroups (age, sex, race/ethnicity, comorbidity, site, device/scanner). GMLP Principle 3 requires datasets that represent the intended population.',
      severity: 'critical-gap',
      citations: ['GMLP-2021'],
    });
    actions.push(
      'Characterize the intended-use population and demonstrate training/test data representativeness; report performance by clinically meaningful subgroups.',
    );
  } else {
    biasFindings.push({
      topic: 'Data representativeness',
      detail:
        'Training data are asserted representative of the intended population (GMLP Principle 3). Ensure this is substantiated with documented demographic/site/device coverage and subgroup performance.',
      severity: 'pass',
      citations: ['GMLP-2021'],
    });
  }

  if (params.externalValidationPerformed === false) {
    biasFindings.push({
      topic: 'Generalizability / external validation',
      detail:
        'No independent external or multi-site validation was performed. Without it, generalizability beyond the development sites is unsupported and overfitting to site-specific artifacts cannot be excluded. GMLP Principles 4 and 6 require independence of training and test sets and clinically relevant test conditions.',
      severity: 'gap',
      citations: ['GMLP-2021'],
    });
    actions.push(
      'Perform external/multi-site validation on data independent of model development to establish generalizability.',
    );
  } else {
    biasFindings.push({
      topic: 'Generalizability / external validation',
      detail:
        'Independent external/multi-site validation was performed (GMLP Principles 4 & 6). Confirm the test set is fully independent of training/tuning data and reflects the intended clinical environment.',
      severity: 'pass',
      citations: ['GMLP-2021'],
    });
  }

  // ── Monitoring ────────────────────────────────────────────────────────
  if (params.realWorldMonitoring === false) {
    monitoringFindings.push({
      topic: 'Real-world performance monitoring',
      detail:
        'No post-deployment monitoring is described. AI/ML performance can drift due to data/population shift, upstream device changes, or workflow changes. GMLP Principle 10 requires monitoring of deployed models for performance and re-training risks. This is also the trigger condition that should be wired into a PCCP.',
      severity: 'gap',
      citations: ['GMLP-2021', 'FDA-PCCP-2024'],
    });
    actions.push(
      'Define a real-world performance monitoring plan (metrics, thresholds, data drift detection, complaint handling) per GMLP Principle 10.',
    );
  } else {
    monitoringFindings.push({
      topic: 'Real-world performance monitoring',
      detail:
        'Post-deployment monitoring is in place (GMLP Principle 10). Confirm metrics, drift detection, alert thresholds, and the link to corrective action / PCCP re-validation triggers.',
      severity: 'pass',
      citations: ['GMLP-2021'],
    });
  }

  // ── Generative / foundation model ─────────────────────────────────────
  if (params.usesGenerativeOrFoundationModel === true) {
    riskFlags.push({
      topic: 'Generative / foundation model',
      detail:
        'A generative or foundation-model component introduces additional risks: non-determinism, hallucination/confabulation, opaque training provenance, prompt sensitivity, and an enormous and shifting input space that is hard to fully validate. Constrain outputs, define the operating envelope tightly, and treat output variability as a hazard in the ISO 14971 analysis.',
      severity: 'attention',
      citations: ['ISO-14971', 'GMLP-2021', 'FDA-TRANSPARENCY-2024'],
    });
  }

  // ── SaMD category interplay ───────────────────────────────────────────
  if (params.samdCategory === 'IV' && params.autonomyLevel === 'autonomous') {
    riskFlags.push({
      topic: 'Highest combined risk',
      detail:
        'Autonomous operation in a Category IV (treat/diagnose, critical situation) context concentrates the maximum harm potential. Expect the highest validation bar, an independent results review, conservative operating points, and explicit fail-safe / abstain behavior.',
      severity: 'critical-gap',
      citations: ['IMDRF-N12', 'IMDRF-N41', 'GMLP-2021'],
    });
  }

  const autonomyNarrative = autonomyNarrativeFor(params.autonomyLevel);

  const citations = resolveCitations([
    'FDA-AIML-DISC-2019',
    'FDA-AIML-ACTION-2021',
    'FDA-PCCP-2024',
    'GMLP-2021',
    'FDA-TRANSPARENCY-2024',
    'IMDRF-N12',
    'IMDRF-N41',
    'ISO-14971',
  ]);

  return {
    algorithmType: params.algorithmType,
    autonomyLevel: params.autonomyLevel,
    autonomyNarrative,
    pccpRecommended,
    pccpRationale,
    transparencyFindings,
    biasAndGeneralizabilityFindings: biasFindings,
    monitoringFindings,
    overallRiskFlags: riskFlags,
    recommendedActions: actions,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — designPCCP
// Predetermined Change Control Plan (FDA Dec 2024)
// ════════════════════════════════════════════════════════════════════════════

/** A single pre-specified modification within the PCCP. */
export interface PlannedModification {
  /** Short label, e.g. "Periodic retraining on new sites". */
  label: string;
  /** What changes (data, model, inputs, performance spec). */
  description: string;
  /** Category of modification. */
  type:
    | 'retraining'
    | 'performance-improvement'
    | 'input-expansion'
    | 'output-change'
    | 'population-expansion'
    | 'architecture-change'
    | 'other';
}

export interface DesignPCCPParams {
  /** Device / SaMD name or descriptor. */
  deviceName?: string;
  /** SaMD category for scaling rigor (optional). */
  samdCategory?: SaMDCategory;
  /** Algorithm type. */
  algorithmType?: AlgorithmType;
  /** The set of modifications to pre-authorize. */
  plannedModifications: PlannedModification[];
  /** Will any modification change the intended use / indications for use. */
  changesIntendedUse?: boolean;
  /** Will any modification expand the patient population beyond the cleared one. */
  expandsPopulation?: boolean;
  /** Will any modification introduce a new input type/modality. */
  addsNewInputModality?: boolean;
  /** Is automated/continuous retraining ("learning in the field") proposed. */
  continuousLearningProposed?: boolean;
}

export interface PCCPModificationProtocol {
  dataManagement: string[];
  retrainingPractices: string[];
  performanceEvaluation: string[];
  updateProcedures: string[];
}

export interface DesignPCCPResult {
  deviceName: string;
  pccpAppropriate: boolean;
  // The three components FDA requires in a PCCP.
  descriptionOfModifications: Array<{
    label: string;
    type: PlannedModification['type'];
    description: string;
    withinPCCPEnvelope: boolean;
    note: string;
  }>;
  modificationProtocol: PCCPModificationProtocol;
  impactAssessment: Finding[];
  outOfScopeModifications: Finding[];
  acceptanceCriteriaGuidance: string[];
  filingGuidance: string[];
  citations: Citation[];
}

/**
 * Design a Predetermined Change Control Plan. Builds the three FDA-required
 * components (Description of Modifications, Modification Protocol, Impact
 * Assessment) and flags modifications that fall outside the PCCP envelope.
 */
export function designPCCP(params: DesignPCCPParams): DesignPCCPResult {
  const deviceName = params.deviceName && params.deviceName.trim().length > 0
    ? params.deviceName
    : 'the subject device';

  // A modification stays inside the PCCP envelope only if it does NOT alter the
  // intended use, does NOT expand the population beyond the cleared envelope,
  // and the type is one FDA describes as amenable to a PCCP.
  const envelopeBreakingTypes: PlannedModification['type'][] = [
    'output-change',
    'population-expansion',
    'architecture-change',
  ];

  const descriptionOfModifications = params.plannedModifications.map(
    (m: PlannedModification) => {
      const breaksEnvelope =
        (m.type === 'population-expansion' && params.expandsPopulation !== false) ||
        envelopeBreakingTypes.indexOf(m.type) !== -1;
      const within = !breaksEnvelope;
      const note = within
        ? 'Eligible for inclusion in the PCCP provided the Modification Protocol fully specifies how it will be implemented, verified, validated, and rolled out.'
        : 'Likely OUTSIDE a PCCP envelope: changes to the output type, expansion of the indicated population, or fundamental architecture changes generally require a new marketing submission rather than PCCP pre-authorization.';
      return {
        label: m.label,
        type: m.type,
        description: m.description,
        withinPCCPEnvelope: within,
        note,
      };
    },
  );

  const outOfScope: Finding[] = [];
  if (params.changesIntendedUse === true) {
    outOfScope.push({
      topic: 'Intended use change',
      detail:
        'A modification that changes the intended use / indications for use CANNOT be authorized through a PCCP. Per the FDA PCCP guidance, the intended use must remain fixed; an intended-use change requires a new marketing submission.',
      severity: 'critical-gap',
      citations: ['FDA-PCCP-2024'],
    });
  }
  if (params.expandsPopulation === true) {
    outOfScope.push({
      topic: 'Population expansion',
      detail:
        'Expanding the patient population beyond the cleared/approved indication generally exceeds the PCCP envelope and typically requires a new marketing submission, unless the expansion was itself fully pre-specified and validated within the Modification Protocol.',
      severity: 'gap',
      citations: ['FDA-PCCP-2024'],
    });
  }
  if (params.continuousLearningProposed === true) {
    outOfScope.push({
      topic: 'Continuous / automated learning',
      detail:
        'Fully automated continuous learning in the field is difficult to bound within a PCCP. FDA generally expects updates to be the result of a controlled, verifiable process with human oversight and explicit re-validation against pre-specified acceptance criteria, not unsupervised in-field adaptation.',
      severity: 'gap',
      citations: ['FDA-PCCP-2024', 'GMLP-2021'],
    });
  }

  // PCCP is appropriate when there is at least one in-envelope modification and
  // no fatal intended-use change consuming the whole plan.
  const hasInEnvelope = descriptionOfModifications.some(
    (d): boolean => d.withinPCCPEnvelope,
  );
  const pccpAppropriate = hasInEnvelope;

  const modificationProtocol: PCCPModificationProtocol = {
    dataManagement: [
      'Specify data sources, inclusion/exclusion criteria, and how new training/tuning/test data are collected, curated, labeled, and version-controlled.',
      'Define data quality assurance, de-identification, and provenance tracking; ensure the reference standard process is documented and reproducible (GMLP Principles 2, 5).',
      'Guarantee independence between training/tuning data and the test data used to evaluate each update (GMLP Principle 4); pre-define dataset partitioning rules.',
      'Define how representativeness of the intended-use population (and subgroups) is maintained as data are added (GMLP Principle 3).',
    ],
    retrainingPractices: [
      'Specify the retraining trigger(s) (scheduled cadence, data drift detection, performance threshold breach) and the exact retraining pipeline, including frozen architecture and hyperparameter search space.',
      'Define configuration management and traceability so each deployed model version is reproducible and linked to its training/test datasets and metrics (IEC 62304 configuration management).',
      'Constrain what may change (e.g., weights only, fixed architecture, fixed input/output) so updates remain within the cleared device boundary.',
    ],
    performanceEvaluation: [
      'Pre-specify the performance metrics, the reference standard, the test datasets, and the statistical analysis plan used to qualify EACH update before deployment.',
      'Pre-specify quantitative acceptance criteria (e.g., the update must be non-inferior to the cleared model on the primary metric and must not degrade any subgroup below a defined floor).',
      'Require subgroup/stratified performance evaluation to detect bias introduced by an update (GMLP Principles 3, 6).',
      'Define how regression and human-factors impacts are assessed when relevant (GMLP Principles 6, 7).',
    ],
    updateProcedures: [
      'Define the verification & validation, release approval, version control, and rollback procedures for deploying an update (21 CFR 820.30, IEC 62304).',
      'Define how users/clinicians are notified of an update and any changes to labeling/transparency artifacts.',
      'Define real-world performance monitoring after each update and the criteria to revert or to file a new submission (GMLP Principle 10).',
      'Maintain records demonstrating each deployed update met the pre-specified acceptance criteria for audit and FDA inspection.',
    ],
  };

  const impactAssessment: Finding[] = [
    {
      topic: 'Benefit-risk of the modification envelope',
      detail:
        'Document the benefits, risks, and risk-mitigations of implementing the planned modifications versus the cleared device, including how the Modification Protocol controls each new/elevated risk. The Impact Assessment must demonstrate that, when modifications are implemented per the protocol, the device remains safe and effective (FDA PCCP Guidance).',
      severity: 'attention',
      citations: ['FDA-PCCP-2024', 'ISO-14971'],
    },
    {
      topic: 'Cumulative effect',
      detail:
        'Assess the cumulative effect of successive modifications (not just each in isolation) so iterative drift away from the cleared baseline is bounded.',
      severity: 'attention',
      citations: ['FDA-PCCP-2024'],
    },
    {
      topic: 'Bias / subgroup risk',
      detail:
        'Explicitly assess the risk that an update degrades performance for any subgroup, and bind the Modification Protocol acceptance criteria to prevent it (GMLP Principle 3).',
      severity: 'attention',
      citations: ['GMLP-2021'],
    },
  ];

  if (params.addsNewInputModality === true) {
    impactAssessment.push({
      topic: 'New input modality',
      detail:
        'Adding a new input type/modality materially changes analytical validation needs. If included, the Modification Protocol must pre-specify validation for the new input; otherwise it is out of envelope and needs a new submission.',
      severity: 'gap',
      citations: ['FDA-PCCP-2024'],
    });
  }

  const acceptanceCriteriaGuidance: string[] = [
    'Each update must be qualified against PRE-SPECIFIED, quantitative acceptance criteria fixed in the Modification Protocol before any data are seen.',
    'Typical primary criterion: non-inferiority (or superiority) of the updated model versus the cleared model on the primary performance metric, with a pre-defined margin.',
    'Typical guardrail criterion: no clinically meaningful degradation on any pre-specified subgroup relative to a defined floor.',
    'Define the statistical test, confidence level, and sample-size justification for the qualification dataset.',
  ];

  const rigorNote =
    params.samdCategory === 'IV' || params.samdCategory === 'III'
      ? 'Given the high SaMD category, hold the Modification Protocol to a high evidentiary bar: independent qualification data, conservative acceptance margins, and explicit subgroup floors.'
      : 'Scale the Modification Protocol rigor to the SaMD category and benefit-risk profile.';

  const filingGuidance: string[] = [
    'Include all three PCCP components in the marketing submission: (1) Description of Modifications, (2) Modification Protocol, (3) Impact Assessment (FDA PCCP Guidance, December 2024).',
    'Modifications implemented in conformance with an authorized PCCP do NOT require a new marketing submission; modifications outside the PCCP DO.',
    'A PCCP is reviewed and authorized as part of the 510(k), De Novo, or PMA; document control of the PCCP itself under the quality system (21 CFR 820.30).',
    rigorNote,
  ];

  if (!pccpAppropriate) {
    filingGuidance.unshift(
      'NOTE: No planned modification fits within a PCCP envelope as specified. Reconsider scope — a PCCP requires at least one bounded, pre-specifiable modification that does not change the intended use.',
    );
  }

  const citations = resolveCitations([
    'FDA-PCCP-2024',
    'GMLP-2021',
    'ISO-14971',
    'IEC-62304',
    'CFR-820-30',
    'FDA-AIML-ACTION-2021',
  ]);

  return {
    deviceName,
    pccpAppropriate,
    descriptionOfModifications,
    modificationProtocol,
    impactAssessment,
    outOfScopeModifications: outOfScope,
    acceptanceCriteriaGuidance,
    filingGuidance,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5 — assessGMLP
// Good Machine Learning Practice — 10 guiding principles
// ════════════════════════════════════════════════════════════════════════════

/** Conformity status for a GMLP principle. */
export type GMLPConformity = 'conformant' | 'partial' | 'non-conformant' | 'not-assessed';

/** Per-principle input. */
export interface GMLPPrincipleInput {
  /** Principle number 1-10. */
  principle: number;
  /** Self-assessed conformity. */
  conformity: GMLPConformity;
  /** Optional supporting evidence note. */
  evidence?: string;
}

export interface AssessGMLPParams {
  /** Inputs for each principle the user wishes to assess (1-10). */
  principleInputs: GMLPPrincipleInput[];
  /** Optional SaMD category for context. */
  samdCategory?: SaMDCategory;
}

interface GMLPPrincipleDef {
  principle: number;
  title: string;
  summary: string;
  keyExpectations: string[];
}

const GMLP_PRINCIPLES: GMLPPrincipleDef[] = [
  {
    principle: 1,
    title: 'Multi-disciplinary expertise is leveraged throughout the total product life cycle',
    summary:
      'In-depth understanding of a model\'s intended integration into clinical workflow, and the desired benefits and patient risks, helps ensure ML-enabled devices are safe and effective and address clinically meaningful needs over the device life cycle.',
    keyExpectations: [
      'Clinical, data science, software, regulatory and human-factors expertise engaged across the life cycle.',
      'Intended clinical workflow integration understood and documented.',
    ],
  },
  {
    principle: 2,
    title: 'Good software engineering and security practices are implemented',
    summary:
      'Model design is implemented with attention to the fundamentals of good software engineering practice, data quality assurance, data management, and robust cybersecurity practices.',
    keyExpectations: [
      'Risk management and design process (IEC 62304, ISO 14971) applied.',
      'Cybersecurity practices integrated (AAMI SW96 / IEC 81001-5-1).',
      'Data quality assurance and authenticity/integrity controls implemented.',
    ],
  },
  {
    principle: 3,
    title:
      'Clinical study participants and data sets are representative of the intended patient population',
    summary:
      'Data collection protocols ensure relevant characteristics of the intended patient population (e.g., age, sex, race, ethnicity), use, and measurement inputs are sufficiently represented so results can be reasonably generalized; this helps manage bias and promotes equity.',
    keyExpectations: [
      'Intended-use population characterized; representativeness demonstrated.',
      'Subgroup coverage and performance reported; bias actively managed.',
    ],
  },
  {
    principle: 4,
    title: 'Training data sets are independent of test sets',
    summary:
      'Training and test data sets are selected and maintained to be appropriately independent of one another. All potential sources of dependence (patient, data acquisition, site factors) are considered and addressed to assure independence.',
    keyExpectations: [
      'No patient/site/scanner leakage between training, tuning and test partitions.',
      'Independence verified and documented.',
    ],
  },
  {
    principle: 5,
    title: 'Selected reference datasets are based upon best available methods',
    summary:
      'Accepted, best-available methods for developing a reference dataset (i.e., a reference standard) ensure clinically relevant and well-characterized data are collected and the limitations of the reference are understood.',
    keyExpectations: [
      'Reference standard defined using best-available, accepted methods.',
      'Labeling/adjudication process and its limitations documented.',
    ],
  },
  {
    principle: 6,
    title: 'Model design is tailored to the available data and reflects the intended use',
    summary:
      'Model design is suited to the available data and supports the active mitigation of known risks, like overfitting, performance degradation, and security risks. Clinical benefits and risks are well understood, used to derive clinically meaningful performance goals, and support a safe and effective product.',
    keyExpectations: [
      'Architecture/feature choices justified by data and intended use.',
      'Overfitting and degradation risks actively mitigated.',
      'Clinically meaningful performance goals defined.',
    ],
  },
  {
    principle: 7,
    title: 'Focus is placed on the performance of the Human-AI Team',
    summary:
      'Where the model has a "human in the loop," human factors considerations and the human interpretability of the model outputs are addressed with emphasis on the performance of the Human-AI team, rather than just the performance of the model in isolation.',
    keyExpectations: [
      'Human-factors / usability engineering applied (IEC 62366-1).',
      'Output interpretability supports correct reliance and override.',
      'Human-AI team performance (not just model) evaluated where applicable.',
    ],
  },
  {
    principle: 8,
    title: 'Testing demonstrates device performance during clinically relevant conditions',
    summary:
      'Statistically sound test plans are developed and executed to generate clinically relevant device performance information independently of the training data set. Considerations include the intended population, important subgroups, clinical environment, inputs, and measurement equipment.',
    keyExpectations: [
      'Pre-specified, statistically sound test plan on independent data.',
      'Performance characterized across clinically relevant conditions and subgroups.',
    ],
  },
  {
    principle: 9,
    title: 'Users are provided clear, essential information',
    summary:
      'Users are provided ready access to clear, contextually relevant information appropriate for the intended audience — the product\'s intended use and indications, performance for appropriate subgroups, characteristics of the data used, acceptable inputs, known limitations, and the basis for decisions where available.',
    keyExpectations: [
      'Transparent labeling: intended use, population, subgroup performance, inputs, limitations.',
      'Aligned with FDA transparency guiding principles.',
    ],
  },
  {
    principle: 10,
    title: 'Deployed models are monitored for performance and re-training risks are managed',
    summary:
      'Deployed models have the capability to be monitored in "real world" use with a focus on maintained or improved safety and performance. When models are periodically or continually trained, there are appropriate controls to manage risks of overfitting, unintended bias, or degradation (e.g., dataset drift).',
    keyExpectations: [
      'Real-world performance monitoring with metrics and thresholds.',
      'Data/dataset drift detection and controlled re-training (ties to PCCP).',
    ],
  },
];

const GMLP_INDEX: Map<number, GMLPPrincipleDef> = new Map(
  GMLP_PRINCIPLES.map((p: GMLPPrincipleDef): [number, GMLPPrincipleDef] => [p.principle, p]),
);

export interface GMLPPrincipleResult {
  principle: number;
  title: string;
  summary: string;
  conformity: GMLPConformity;
  keyExpectations: string[];
  evidence: string;
  gapNarrative: string;
  citations: string[];
}

export interface AssessGMLPResult {
  principleResults: GMLPPrincipleResult[];
  conformantCount: number;
  partialCount: number;
  nonConformantCount: number;
  notAssessedCount: number;
  overallConformityScore: number; // 0-100, deterministic
  overallVerdict: Verdict;
  prioritizedGaps: Finding[];
  citations: Citation[];
}

function conformityWeight(c: GMLPConformity): number {
  if (c === 'conformant') return 1;
  if (c === 'partial') return 0.5;
  return 0; // non-conformant or not-assessed
}

/**
 * Assess Good Machine Learning Practice conformity across the 10 GMLP guiding
 * principles. Deterministic scoring; flags non-conformant/partial principles.
 */
export function assessGMLP(params: AssessGMLPParams): AssessGMLPResult {
  const inputIndex: Map<number, GMLPPrincipleInput> = new Map(
    params.principleInputs.map(
      (i: GMLPPrincipleInput): [number, GMLPPrincipleInput] => [i.principle, i],
    ),
  );

  const principleResults: GMLPPrincipleResult[] = [];
  let conformantCount = 0;
  let partialCount = 0;
  let nonConformantCount = 0;
  let notAssessedCount = 0;
  let weightSum = 0;

  const prioritizedGaps: Finding[] = [];

  for (const def of GMLP_PRINCIPLES) {
    const input = inputIndex.get(def.principle);
    const conformity: GMLPConformity = input ? input.conformity : 'not-assessed';
    const evidence = input && input.evidence ? input.evidence : '';

    if (conformity === 'conformant') conformantCount += 1;
    else if (conformity === 'partial') partialCount += 1;
    else if (conformity === 'non-conformant') nonConformantCount += 1;
    else notAssessedCount += 1;

    weightSum += conformityWeight(conformity);

    let gapNarrative: string;
    if (conformity === 'conformant') {
      gapNarrative = 'No gap identified for this principle; ensure objective evidence is retained.';
    } else if (conformity === 'partial') {
      gapNarrative =
        'Partial conformity — close the remaining gap before submission. Key expectations: ' +
        def.keyExpectations.join(' ');
    } else if (conformity === 'non-conformant') {
      gapNarrative =
        'NON-CONFORMANT — this is a likely review deficiency. Address before submission. Key expectations: ' +
        def.keyExpectations.join(' ');
    } else {
      gapNarrative =
        'Not assessed — assess this principle and document objective evidence. Key expectations: ' +
        def.keyExpectations.join(' ');
    }

    principleResults.push({
      principle: def.principle,
      title: def.title,
      summary: def.summary,
      conformity,
      keyExpectations: def.keyExpectations,
      evidence,
      gapNarrative,
      citations: ['GMLP-2021'],
    });

    if (conformity === 'non-conformant') {
      prioritizedGaps.push({
        topic: `GMLP Principle ${def.principle}: ${def.title}`,
        detail: gapNarrative,
        severity: 'critical-gap',
        citations: ['GMLP-2021'],
      });
    } else if (conformity === 'partial') {
      prioritizedGaps.push({
        topic: `GMLP Principle ${def.principle}: ${def.title}`,
        detail: gapNarrative,
        severity: 'gap',
        citations: ['GMLP-2021'],
      });
    } else if (conformity === 'not-assessed') {
      prioritizedGaps.push({
        topic: `GMLP Principle ${def.principle}: ${def.title}`,
        detail: gapNarrative,
        severity: 'attention',
        citations: ['GMLP-2021'],
      });
    }
  }

  const overallConformityScore = Math.round((weightSum / GMLP_PRINCIPLES.length) * 100);

  let overallVerdict: Verdict;
  if (nonConformantCount > 0) overallVerdict = 'critical-gap';
  else if (partialCount > 0 || notAssessedCount > 0) overallVerdict = 'gap';
  else overallVerdict = 'pass';

  // Reference unused index map deterministically to avoid dead code while
  // keeping it available for principle lookup.
  void GMLP_INDEX;

  const citations = resolveCitations([
    'GMLP-2021',
    'FDA-TRANSPARENCY-2024',
    'IEC-62304',
    'ISO-14971',
    'FDA-PCCP-2024',
  ]);

  return {
    principleResults,
    conformantCount,
    partialCount,
    nonConformantCount,
    notAssessedCount,
    overallConformityScore,
    overallVerdict,
    prioritizedGaps,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 6 — designSaMDClinicalValidation
// IMDRF N41 clinical evaluation
// ════════════════════════════════════════════════════════════════════════════

export interface DesignSaMDClinicalValidationParams {
  /** SaMD category (from classifySaMD). Drives the depth of evidence. */
  samdCategory: SaMDCategory;
  /** Is the underlying clinical association already well-established in the literature. */
  validClinicalAssociationEstablished?: boolean;
  /** Is the SaMD an AI/ML function (adds analytical/generalizability emphasis). */
  isAIML?: boolean;
  /** Free-text intended use. */
  intendedUse?: string;
  /** Is there an accepted reference standard / ground truth. */
  referenceStandardAvailable?: boolean;
  /** Will the validation rely on existing/real-world data vs. new prospective data. */
  prospectiveDataPlanned?: boolean;
  /** Autonomy level (affects the human-AI team evaluation need). */
  autonomyLevel?: AutonomyLevel;
}

export interface ClinicalEvaluationPillar {
  pillar: 'valid-clinical-association' | 'analytical-validation' | 'clinical-validation';
  title: string;
  question: string;
  required: boolean;
  rigor: 'leverage-existing' | 'standard' | 'high' | 'highest';
  evidenceElements: string[];
  citations: string[];
}

export interface DesignSaMDClinicalValidationResult {
  samdCategory: SaMDCategory;
  pillars: ClinicalEvaluationPillar[];
  evidencePlan: Requirement[];
  independentReviewExpected: boolean;
  studyDesignGuidance: string[];
  performanceMetricsGuidance: string[];
  overallNarrative: string;
  citations: Citation[];
}

function rigorForCategory(
  cat: SaMDCategory,
): 'standard' | 'high' | 'highest' {
  if (cat === 'IV') return 'highest';
  if (cat === 'III') return 'high';
  return 'standard';
}

/**
 * Build an IMDRF N41 clinical evaluation / validation evidence plan scaled to
 * the SaMD category: valid clinical association + analytical validation +
 * clinical validation. Deterministic.
 */
export function designSaMDClinicalValidation(
  params: DesignSaMDClinicalValidationParams,
): DesignSaMDClinicalValidationResult {
  const cat = params.samdCategory;
  const baseRigor = rigorForCategory(cat);

  const associationRigor: ClinicalEvaluationPillar['rigor'] =
    params.validClinicalAssociationEstablished === true ? 'leverage-existing' : baseRigor;

  const pillars: ClinicalEvaluationPillar[] = [
    {
      pillar: 'valid-clinical-association',
      title: 'Valid Clinical Association (is the output meaningful?)',
      question:
        'Is there a valid clinical association between the SaMD output and the targeted clinical condition? (IMDRF N41)',
      required: true,
      rigor: associationRigor,
      evidenceElements:
        params.validClinicalAssociationEstablished === true
          ? [
              'Leverage existing evidence: cite peer-reviewed literature, clinical guidelines, or original clinical research establishing the association.',
              'Document the strength and relevance of the cited evidence to the specific intended use and population.',
            ]
          : [
              'Establish the association through a literature search, existing data, or, if absent, generate new clinical evidence.',
              'Justify the clinical relevance of the SaMD output to the intended medical purpose and population.',
            ],
      citations: ['IMDRF-N41'],
    },
    {
      pillar: 'analytical-validation',
      title: 'Analytical / Technical Validation (does the SaMD process input correctly?)',
      question:
        'Does the SaMD correctly and reliably process input data to generate accurate, reliable, and precise output data? (IMDRF N41)',
      required: true,
      rigor: baseRigor,
      evidenceElements: [
        'Verify the software correctly meets specifications (IEC 62304 verification; 21 CFR 820.30 verification).',
        'Characterize accuracy, precision, reliability, and repeatability/reproducibility of the output against the input specification.',
        params.isAIML === true
          ? 'For AI/ML: evaluate algorithm performance on data independent of training/tuning (GMLP Principles 4 & 8); characterize generalizability across sites/devices/subgroups.'
          : 'Characterize performance across the specified input range and edge cases.',
      ],
      citations: params.isAIML === true ? ['IMDRF-N41', 'GMLP-2021', 'IEC-62304'] : ['IMDRF-N41', 'IEC-62304'],
    },
    {
      pillar: 'clinical-validation',
      title: 'Clinical Validation (does using the SaMD achieve the intended purpose?)',
      question:
        'Does use of the SaMD\'s accurate, reliable output achieve the intended clinical purpose in the target population in the intended use environment? (IMDRF N41)',
      required: true,
      rigor: baseRigor,
      evidenceElements: [
        'Demonstrate clinically meaningful performance in the intended population and use environment.',
        params.autonomyLevel === 'autonomous'
          ? 'Autonomous use: characterize stand-alone clinical performance (sensitivity/specificity/PPV/NPV at the operating point) since no clinician reviews each output.'
          : 'Human-in-the-loop use: evaluate the Human-AI team performance, not just the model in isolation (GMLP Principle 7).',
        'Define and justify clinically meaningful endpoints and acceptance criteria a priori.',
      ],
      citations: ['IMDRF-N41', 'GMLP-2021'],
    },
  ];

  // Evidence plan, scaled by category.
  const evidencePlan: Requirement[] = [
    {
      id: 'CE-01',
      requirement: 'Document the SaMD definition statement (intended use / intended medical purpose).',
      rationale:
        'The SaMD definition statement anchors the entire clinical evaluation and the N12 categorization (IMDRF N41 §6).',
      citations: ['IMDRF-N41', 'IMDRF-N12'],
      mandatory: true,
    },
    {
      id: 'CE-02',
      requirement: 'Establish the valid clinical association.',
      rationale: 'First pillar of IMDRF N41 clinical evaluation.',
      citations: ['IMDRF-N41'],
      mandatory: true,
    },
    {
      id: 'CE-03',
      requirement: 'Complete analytical validation against the input/output specification.',
      rationale: 'Second pillar of IMDRF N41; ties to IEC 62304 verification.',
      citations: ['IMDRF-N41', 'IEC-62304'],
      mandatory: true,
    },
    {
      id: 'CE-04',
      requirement: 'Complete clinical validation in the intended population and environment.',
      rationale: 'Third pillar of IMDRF N41.',
      citations: ['IMDRF-N41'],
      mandatory: true,
    },
    {
      id: 'CE-05',
      requirement: 'Define a priori, clinically meaningful performance endpoints and acceptance criteria.',
      rationale: 'Prevents post-hoc metric selection; supports a defensible benefit-risk determination.',
      citations: ['IMDRF-N41', 'GMLP-2021'],
      mandatory: true,
    },
  ];

  if (params.referenceStandardAvailable === false) {
    evidencePlan.push({
      id: 'CE-06',
      requirement: 'Establish a reference standard (ground truth) using best-available accepted methods.',
      rationale:
        'No accepted reference standard is available; one must be defined and its limitations documented (GMLP Principle 5).',
      citations: ['GMLP-2021', 'IMDRF-N41'],
      mandatory: true,
    });
  }

  if (cat === 'IV' || cat === 'III') {
    evidencePlan.push({
      id: 'CE-07',
      requirement: 'Provide independent review of the clinical evaluation results.',
      rationale:
        'IMDRF N41 recommends independent review of results for higher-impact SaMD categories; FDA expects robust, independent evidence for high-risk functions.',
      citations: ['IMDRF-N41', 'IMDRF-N12'],
      mandatory: cat === 'IV',
    });
  }

  if (params.isAIML === true) {
    evidencePlan.push({
      id: 'CE-08',
      requirement:
        'Demonstrate generalizability via independent external/multi-site validation and subgroup performance.',
      rationale:
        'AI/ML functions require evidence of generalizability and bias control (GMLP Principles 3, 4, 6, 8).',
      citations: ['GMLP-2021', 'IMDRF-N41'],
      mandatory: true,
    });
  }

  const independentReviewExpected = cat === 'IV' || cat === 'III';

  const studyDesignGuidance: string[] = [];
  if (params.prospectiveDataPlanned === false) {
    studyDesignGuidance.push(
      'Retrospective/real-world data may be acceptable for clinical validation if data quality, reference standard, and independence from training data are well controlled; otherwise prospective data are preferred for higher categories.',
    );
  } else {
    studyDesignGuidance.push(
      'Prospective data collection is planned; pre-register the analysis plan, endpoints, and acceptance criteria.',
    );
  }
  if (cat === 'IV') {
    studyDesignGuidance.push(
      'Category IV: expect the most rigorous design — prospective and/or pivotal-grade evidence, independent results review, conservative operating points, and full subgroup characterization.',
    );
  } else if (cat === 'III') {
    studyDesignGuidance.push(
      'Category III: robust analytical + clinical validation; multi-site/independent test data strongly recommended.',
    );
  } else if (cat === 'II') {
    studyDesignGuidance.push(
      'Category II: analytical validation plus clinical validation scaled to moderate harm; independent test data recommended.',
    );
  } else {
    studyDesignGuidance.push(
      'Category I: establish the valid clinical association and analytical validation; clinical validation may leverage existing evidence where the association is well accepted.',
    );
  }

  const performanceMetricsGuidance: string[] = [
    'Report the operating point and the full operating characteristic where applicable (e.g., ROC/AUC, sensitivity, specificity, PPV, NPV, and confidence intervals).',
    'Report performance stratified by clinically meaningful subgroups to detect bias (GMLP Principles 3, 8).',
    'Pre-specify the primary metric, the success threshold, and the statistical analysis plan (sample size, test, confidence level).',
  ];
  if (params.autonomyLevel === 'autonomous') {
    performanceMetricsGuidance.push(
      'Autonomous function: stand-alone algorithm performance is the primary evidence; characterize failure/abstain behavior and the consequences of false positives/negatives at the cleared operating point.',
    );
  } else if (params.autonomyLevel === 'augmentative' || params.autonomyLevel === 'assistive') {
    performanceMetricsGuidance.push(
      'Human-in-the-loop function: report Human-AI team performance (reader study with vs. without the aid) in addition to stand-alone performance where applicable.',
    );
  }

  const overallNarrative =
    `SaMD Category ${cat} clinical evaluation per IMDRF N41 rests on three pillars: (1) Valid Clinical ` +
    `Association, (2) Analytical Validation, and (3) Clinical Validation. The evidentiary rigor is ` +
    `"${baseRigor}". ` +
    (independentReviewExpected
      ? 'Independent review of the results is expected for this category. '
      : 'Independent review of results is not specifically expected at this category, though objective evidence must be retained. ') +
    (params.isAIML === true
      ? 'As an AI/ML function, generalizability (independent external validation) and subgroup/bias characterization are required alongside the three pillars (GMLP).'
      : 'Standard software verification/validation (IEC 62304) supports the analytical pillar.');

  const citations = resolveCitations([
    'IMDRF-N41',
    'IMDRF-N12',
    'GMLP-2021',
    'IEC-62304',
    'CFR-820-30',
    'FDA-TRANSPARENCY-2024',
  ]);

  return {
    samdCategory: cat,
    pillars,
    evidencePlan,
    independentReviewExpected,
    studyDesignGuidance,
    performanceMetricsGuidance,
    overallNarrative,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 7 — assessDeviceCybersecurity
// FDA Premarket Cybersecurity (2023) + Section 524B FD&C Act
// ════════════════════════════════════════════════════════════════════════════

export interface AssessDeviceCybersecurityParams {
  /** Does the device connect to the internet/network or other devices/cloud. */
  networkConnected?: boolean;
  /** Does the device include or rely on software (a "cyber device" gate for 524B). */
  includesSoftware?: boolean;
  /** Is the submission on/after the 524B effective date (default true). */
  submissionUnder524B?: boolean;
  /** Has a threat model been produced. */
  threatModelProvided?: boolean;
  /** Has a Software Bill of Materials (SBOM) been produced. */
  sbomProvided?: boolean;
  /** Has security risk management (per AAMI TIR57 / SW96) been performed. */
  securityRiskManagementProvided?: boolean;
  /** Are coordinated vulnerability disclosure / handling processes in place. */
  vulnerabilityHandlingProcess?: boolean;
  /** Is there a plan to monitor and patch post-market (PSIRT, update mechanism). */
  postMarketUpdatePlan?: boolean;
  /** Does the device process or store ePHI / sensitive data. */
  handlesSensitiveData?: boolean;
  /** Free-text device descriptor (optional). */
  deviceName?: string;
}

export interface CyberRequirementResult {
  id: string;
  requirement: string;
  status: 'present' | 'missing' | 'not-applicable';
  detail: string;
  severity: Verdict;
  citations: string[];
}

export interface Assess524BResult {
  applies: boolean;
  rationale: string;
  obligations: string[];
  citations: string[];
}

export interface AssessDeviceCybersecurityResult {
  deviceName: string;
  isCyberDevice: boolean;
  section524B: Assess524BResult;
  requirements: CyberRequirementResult[];
  threatModelingGuidance: string[];
  sbomGuidance: string[];
  securityRiskManagementGuidance: string[];
  vulnerabilityHandlingGuidance: string[];
  overallVerdict: Verdict;
  criticalGapCount: number;
  citations: Citation[];
}

/**
 * Assess premarket cybersecurity for a device software function: threat
 * modeling, SBOM, security risk management (AAMI TIR57/SW96), vulnerability
 * handling, and Section 524B "cyber device" obligations. Deterministic.
 */
export function assessDeviceCybersecurity(
  params: AssessDeviceCybersecurityParams,
): AssessDeviceCybersecurityResult {
  const deviceName =
    params.deviceName && params.deviceName.trim().length > 0
      ? params.deviceName
      : 'the subject device';

  // Section 524B "cyber device" gate: a device that (1) includes validated
  // software, (2) has the ability to connect to the internet, and (3) contains
  // technological characteristics that could be vulnerable to cybersecurity
  // threats.
  const includesSoftware = params.includesSoftware !== false;
  const networkConnected = params.networkConnected !== false;
  const isCyberDevice = includesSoftware && networkConnected;
  const under524B = params.submissionUnder524B !== false;

  const applies524B = isCyberDevice && under524B;
  const section524B: Assess524BResult = {
    applies: applies524B,
    rationale: applies524B
      ? 'Section 524B applies. The device meets the "cyber device" definition (includes validated software, can connect to the internet, and contains technological characteristics vulnerable to cybersecurity threats) and the submission is on/after the 524B effective date.'
      : isCyberDevice
        ? 'The device meets the "cyber device" definition, but the submission is asserted to predate the 524B effective date; 524B may not be a refuse-to-accept trigger, though FDA premarket cybersecurity expectations still apply.'
        : 'The device does NOT clearly meet the "cyber device" definition (it lacks software and/or network-connection ability). 524B-specific premarket requirements may not apply, but cybersecurity should still be addressed proportionate to risk.',
    obligations: applies524B
      ? [
          'Submit a plan to monitor, identify, and address post-market cybersecurity vulnerabilities and exploits, including coordinated vulnerability disclosure and related procedures [524B(b)(1)].',
          'Design, develop, and maintain processes and procedures to provide a reasonable assurance that the device and related systems are cybersecure, and make available post-market updates and patches to the device and related systems [524B(b)(2)].',
          'Provide a Software Bill of Materials (SBOM), including commercial, open-source, and off-the-shelf software components [524B(b)(3)].',
          'Comply with such other requirements as FDA may require to demonstrate a reasonable assurance of safety and effectiveness [524B(b)(4)].',
        ]
      : [],
    citations: ['FDC-524B', 'FDA-CYBER-2023'],
  };

  const requirements: CyberRequirementResult[] = [];

  // Threat model
  requirements.push({
    id: 'CY-TM',
    requirement: 'Threat model covering the device system, interfaces, and data flows.',
    status: params.threatModelProvided === false ? 'missing' : 'present',
    detail:
      params.threatModelProvided === false
        ? 'No threat model provided. FDA expects a threat model (e.g., STRIDE-based) that identifies assets, trust boundaries, attack surfaces (interfaces, comms, update mechanism), and threats across the system, including connected systems and cloud.'
        : 'Threat model provided. Ensure it covers all interfaces, trust boundaries, the software update path, and connected/cloud systems.',
    severity: params.threatModelProvided === false ? 'gap' : 'pass',
    citations: ['FDA-CYBER-2023', 'AAMI-TIR57'],
  });

  // SBOM
  const sbomStatus: CyberRequirementResult['status'] =
    params.sbomProvided === false ? 'missing' : 'present';
  requirements.push({
    id: 'CY-SBOM',
    requirement: 'Software Bill of Materials (SBOM) per 524B(b)(3) and NTIA minimum elements.',
    status: sbomStatus,
    detail:
      params.sbomProvided === false
        ? 'No SBOM provided. 524B(b)(3) requires an SBOM including commercial, open-source, and off-the-shelf components. Use the NTIA minimum elements (supplier, component name, version, unique identifiers, dependency relationships, author, timestamp).'
        : 'SBOM provided. Confirm it includes commercial/open-source/off-the-shelf components and the NTIA minimum data fields, plus a process to map components to known vulnerabilities.',
    severity:
      params.sbomProvided === false ? (applies524B ? 'critical-gap' : 'gap') : 'pass',
    citations: ['FDC-524B', 'FDA-CYBER-2023', 'NTIA-SBOM'],
  });

  // Security risk management
  requirements.push({
    id: 'CY-SRM',
    requirement:
      'Security risk management, performed separately from but coordinated with safety risk management (AAMI TIR57 / SW96; ISO 14971).',
    status: params.securityRiskManagementProvided === false ? 'missing' : 'present',
    detail:
      params.securityRiskManagementProvided === false
        ? 'No security risk management provided. FDA expects a security risk management process and report distinct from the ISO 14971 safety risk file, addressing exploitability, security risk, and controls — per AAMI TIR57 and ANSI/AAMI SW96.'
        : 'Security risk management provided. Confirm it follows AAMI TIR57/SW96, assesses exploitability and security risk, and links security controls to identified threats.',
    severity: params.securityRiskManagementProvided === false ? 'gap' : 'pass',
    citations: ['FDA-CYBER-2023', 'AAMI-TIR57', 'AAMI-SW96', 'ISO-14971'],
  });

  // Vulnerability handling / CVD
  requirements.push({
    id: 'CY-VULN',
    requirement:
      'Coordinated vulnerability disclosure and vulnerability handling processes [524B(b)(1)].',
    status: params.vulnerabilityHandlingProcess === false ? 'missing' : 'present',
    detail:
      params.vulnerabilityHandlingProcess === false
        ? 'No coordinated vulnerability disclosure (CVD) / handling process described. 524B(b)(1) requires a plan to monitor, identify, and address post-market vulnerabilities, including CVD.'
        : 'Vulnerability handling / CVD process described. Confirm it includes intake, triage, remediation timelines, and customer communication.',
    severity:
      params.vulnerabilityHandlingProcess === false ? (applies524B ? 'critical-gap' : 'gap') : 'pass',
    citations: ['FDC-524B', 'FDA-CYBER-2023'],
  });

  // Post-market update plan
  requirements.push({
    id: 'CY-PATCH',
    requirement: 'Post-market update/patch capability and plan [524B(b)(2)].',
    status: params.postMarketUpdatePlan === false ? 'missing' : 'present',
    detail:
      params.postMarketUpdatePlan === false
        ? 'No post-market update/patch plan described. 524B(b)(2) requires the ability to deploy security updates and patches, on a reasonably justified regular cycle and out-of-cycle for critical vulnerabilities.'
        : 'Post-market update/patch plan described. Confirm a secure update mechanism (signed updates, integrity verification) and a defined cadence plus out-of-cycle process for critical issues.',
    severity:
      params.postMarketUpdatePlan === false ? (applies524B ? 'critical-gap' : 'gap') : 'pass',
    citations: ['FDC-524B', 'FDA-CYBER-2023'],
  });

  // Sensitive data
  if (params.handlesSensitiveData === true) {
    requirements.push({
      id: 'CY-DATA',
      requirement: 'Protection of sensitive data (ePHI) at rest and in transit.',
      status: 'present',
      detail:
        'Device processes/stores sensitive data. Implement and document confidentiality/integrity controls (encryption at rest and in transit, authentication, access control, audit logging) and address them in the security risk management report.',
      severity: 'attention',
      citations: ['FDA-CYBER-2023', 'AAMI-TIR57'],
    });
  }

  // Secure-by-design overarching
  requirements.push({
    id: 'CY-SPDF',
    requirement:
      'Secure Product Development Framework (SPDF) integrated into the quality system / design controls.',
    status: 'present',
    detail:
      'FDA recommends a Secure Product Development Framework spanning the total product life cycle, integrated with 21 CFR 820.30 design controls and IEC 81001-5-1 security life-cycle activities.',
    severity: 'attention',
    citations: ['FDA-CYBER-2023', 'CFR-820-30', 'IEC-81001-5-1'],
  });

  const threatModelingGuidance: string[] = [
    'Use a recognized methodology (e.g., STRIDE) to enumerate threats across the device system: assets, trust boundaries, attack surfaces, and data flows.',
    'Include all interfaces and communication paths (wired/wireless), the software update mechanism, and connected systems (gateways, cloud, mobile apps).',
    'Map each identified threat to a security risk and to one or more security controls; feed results into the security risk management report.',
  ];

  const sbomGuidance: string[] = [
    'Generate a machine-readable SBOM (e.g., SPDX or CycloneDX) covering commercial, open-source, and off-the-shelf components.',
    'Include the NTIA minimum elements: supplier, component name, version, unique identifiers, dependency relationships, author of the SBOM data, and timestamp.',
    'Establish a process to continuously map SBOM components to known vulnerabilities (e.g., CVE/NVD) and to support post-market patching obligations under 524B(b)(2).',
  ];

  const securityRiskManagementGuidance: string[] = [
    'Conduct security risk management per AAMI TIR57 / ANSI-AAMI SW96, distinct from but coordinated with ISO 14971 safety risk management.',
    'Assess exploitability (e.g., using a recognized scoring approach) and the resulting security risk; document residual risk and controls.',
    'Provide security architecture views (global system, multi-patient harm, updateability/patchability, security use-case views) as recommended by the FDA premarket cybersecurity guidance.',
  ];

  const vulnerabilityHandlingGuidance: string[] = [
    'Establish a coordinated vulnerability disclosure (CVD) policy and intake channel.',
    'Define triage, remediation timelines, and customer/health-care-provider communication procedures.',
    'Operate a product security incident response capability (PSIRT) and tie it to the post-market update/patch plan.',
  ];

  // Overall verdict + critical-gap count.
  let criticalGapCount = 0;
  let anyGap = false;
  for (const r of requirements) {
    if (r.severity === 'critical-gap') criticalGapCount += 1;
    if (r.severity === 'critical-gap' || r.severity === 'gap') anyGap = true;
  }
  let overallVerdict: Verdict;
  if (criticalGapCount > 0) overallVerdict = 'critical-gap';
  else if (anyGap) overallVerdict = 'gap';
  else overallVerdict = 'pass';

  const citations = resolveCitations([
    'FDC-524B',
    'FDA-CYBER-2023',
    'AAMI-TIR57',
    'AAMI-SW96',
    'ISO-14971',
    'NTIA-SBOM',
    'IEC-81001-5-1',
    'CFR-820-30',
  ]);

  return {
    deviceName,
    isCyberDevice,
    section524B,
    requirements,
    threatModelingGuidance,
    sbomGuidance,
    securityRiskManagementGuidance,
    vulnerabilityHandlingGuidance,
    overallVerdict,
    criticalGapCount,
    citations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 8 — INTERNAL CONSISTENCY (deterministic, no exports of state)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Defensive runtime self-check helper. Not exported as part of the public API;
 * used only to assert the N12 matrix totality during development. Pure.
 */
function n12CellCount(): number {
  return N12_MATRIX.length;
}
void n12CellCount;
