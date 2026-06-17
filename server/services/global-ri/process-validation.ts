/**
 * Process-validation expert — the lifecycle/qualification framework per region.
 *
 * Process validation is a core RA CMC task: it establishes documented evidence
 * that a manufacturing process, operated within established parameters, can
 * consistently produce a product meeting its predetermined specifications and
 * quality attributes. The framework — and the vocabulary — differs between the
 * FDA (a 3-stage product lifecycle) and the EU (Annex 15 qualification stages
 * DQ→IQ→OQ→PQ plus a choice of validation approaches). This service encodes
 * those frameworks as a reference aid for protocol/strategy planning.
 *
 * Pure / deterministic — no DB, no IO. The encoded stages/approaches are the
 * harmonised framework only; the specific validation strategy, the number of
 * conformance/consecutive batches, and the acceptance criteria are
 * product/process-specific and risk-based, justified case-by-case per
 * ICH Q8–Q11.
 *
 * References:
 *   - FDA Guidance for Industry "Process Validation: General Principles and
 *     Practices" (January 2011) — the three-stage product lifecycle
 *     (Stage 1 Process Design, Stage 2 Process Qualification incl. PPQ,
 *     Stage 3 Continued Process Verification).
 *   - 21 CFR 211 (cGMP for finished pharmaceuticals) — e.g. 211.100 (written
 *     procedures), 211.110 (control of in-process materials).
 *   - EudraLex Volume 4, GMP Annex 15 "Qualification and Validation" —
 *     DQ, IQ, OQ, PQ; process validation approaches (traditional, continuous
 *     process verification, hybrid) and ongoing process verification.
 *   - ICH Q8(R2) Pharmaceutical Development; ICH Q9 Quality Risk Management;
 *     ICH Q10 Pharmaceutical Quality System; ICH Q11 Development and
 *     Manufacture of Drug Substances.
 *
 * @module server/services/global-ri/process-validation
 */

export type PvRegion = 'FDA' | 'EU';

/** A single framework stage (lifecycle stage for FDA, qualification stage for EU). */
export interface PvStage {
  /** Stable stage identifier (e.g. 'stage_2_process_qualification', 'OQ'). */
  id: string;
  /** Human-readable stage title. */
  title: string;
  /** The key activities expected in the stage. */
  activities: string[];
  /** Governing citation for the stage. */
  citation: string;
}

/** The full process-validation framework for a region. */
export interface PvFramework {
  region: PvRegion;
  /** Short label for the framework model (e.g. '3-stage product lifecycle'). */
  model: string;
  /** Ordered framework stages. */
  stages: PvStage[];
  /** The recognised validation approaches in the region. */
  approaches: string[];
  /** Governing citation for the overall framework. */
  citation: string;
  /** Honest caveats / scope notes. */
  notes: string[];
}

const FDA_PV_GUIDANCE =
  'FDA Guidance for Industry "Process Validation: General Principles and Practices" (2011); 21 CFR 211';
const ANNEX_15 = 'EudraLex Vol.4 GMP Annex 15 "Qualification and Validation"';

/** The modeled process-validation regions. */
export const PV_REGIONS: PvRegion[] = ['FDA', 'EU'];

/** FDA three-stage product-lifecycle stage ids (ordered). */
export const FDA_PV_STAGES = [
  'stage_1_process_design',
  'stage_2_process_qualification',
  'stage_3_continued_process_verification',
] as const;

/** EU Annex 15 qualification-stage ids (ordered). */
export const EU_QUALIFICATION_STAGES = ['DQ', 'IQ', 'OQ', 'PQ'] as const;

const RISK_BASED_CAVEAT =
  'Validation expectations are product/process-specific and risk-based per ICH Q8–Q11; this lists the framework stages, not batch numbers (e.g. PPQ conformance batches or consecutive batches), which are justified case-by-case.';

const FDA_FRAMEWORK: PvFramework = {
  region: 'FDA',
  model: '3-stage product lifecycle',
  stages: [
    {
      id: 'stage_1_process_design',
      title: 'Stage 1 — Process Design',
      activities: [
        'Define the commercial manufacturing process based on knowledge gained through development and scale-up activities.',
        'Establish a design space and identify critical quality attributes (CQAs) and critical process parameters (CPPs).',
        'Develop the control strategy (risk assessment, design of experiments, process understanding) per ICH Q8/Q9/Q10.',
        'Document the process design and rationale to support subsequent qualification.',
      ],
      citation: FDA_PV_GUIDANCE,
    },
    {
      id: 'stage_2_process_qualification',
      title: 'Stage 2 — Process Qualification (PQ)',
      activities: [
        'Qualify the facility, utilities, and equipment (design, installation, and operational qualification) as a prerequisite.',
        'Perform Process Performance Qualification (PPQ) — conformance batches demonstrating reproducible commercial-scale performance.',
        'Confirm the process design is capable of reproducible commercial manufacturing under the approved protocol with defined acceptance criteria.',
        'Document PPQ results and obtain quality-unit approval before commercial distribution.',
      ],
      citation: FDA_PV_GUIDANCE,
    },
    {
      id: 'stage_3_continued_process_verification',
      title: 'Stage 3 — Continued Process Verification (CPV)',
      activities: [
        'Provide ongoing assurance the process remains in a state of control during routine commercial production.',
        'Collect and statistically trend process and quality data (intra- and inter-batch variability, CPP/CQA monitoring).',
        'Detect undesired process variability and drive continual improvement and maintenance per ICH Q10.',
      ],
      citation: FDA_PV_GUIDANCE,
    },
  ],
  approaches: [
    'Process Performance Qualification (PPQ) using conformance batches (traditional, per the 2011 guidance lifecycle approach).',
    'Continued Process Verification (CPV) for ongoing, data-driven assurance of control during routine production.',
  ],
  citation: FDA_PV_GUIDANCE,
  notes: [
    'The FDA process-validation lifecycle integrates with cGMP (21 CFR 211) and modern quality concepts (ICH Q8/Q9/Q10).',
    RISK_BASED_CAVEAT,
  ],
};

const EU_FRAMEWORK: PvFramework = {
  region: 'EU',
  model: 'Annex 15 qualification stages (DQ→IQ→OQ→PQ) + process validation',
  stages: [
    {
      id: 'DQ',
      title: 'Design Qualification (DQ)',
      activities: [
        'Document that the proposed design of facilities, systems, and equipment is suitable for the intended purpose.',
        'Demonstrate compliance of the design with GMP and user requirements specifications (URS).',
      ],
      citation: ANNEX_15,
    },
    {
      id: 'IQ',
      title: 'Installation Qualification (IQ)',
      activities: [
        'Verify that facilities, systems, and equipment, as installed, comply with the approved design and the manufacturer recommendations.',
        'Check installation of components, instruments, and supporting utilities; verify calibration and documentation.',
      ],
      citation: ANNEX_15,
    },
    {
      id: 'OQ',
      title: 'Operational Qualification (OQ)',
      activities: [
        'Demonstrate that facilities, systems, and equipment operate as intended across the anticipated operating ranges.',
        'Conduct tests at upper and lower operating limits ("worst case") to confirm proper operation.',
        'Finalise operating and cleaning procedures, operator training, and preventive maintenance requirements.',
      ],
      citation: ANNEX_15,
    },
    {
      id: 'PQ',
      title: 'Performance Qualification (PQ)',
      activities: [
        'Demonstrate that facilities, systems, and equipment, operating together, perform effectively and reproducibly using approved process methods and product specifications.',
        'Use production materials, qualified substitutes, or simulated product under routine conditions.',
      ],
      citation: ANNEX_15,
    },
  ],
  approaches: [
    'Traditional process validation — typically a prospective study on three consecutive production-scale batches (number justified case-by-case).',
    'Continuous process verification (CPV) — a science- and risk-based, real-time alternative leveraging in-line/at-line monitoring and process understanding (ICH Q8–Q11).',
    'Hybrid approach — a combination of traditional validation and continuous process verification for different process steps.',
    'Ongoing process verification during the lifecycle — continued monitoring of the validated state during routine commercial manufacture.',
  ],
  citation: `${ANNEX_15}; ICH Q8/Q9/Q10/Q11`,
  notes: [
    'Annex 15 covers both equipment/system qualification (DQ→IQ→OQ→PQ) and process validation approaches; "PQ" denotes Performance Qualification, distinct from the FDA "Process Qualification" stage.',
    RISK_BASED_CAVEAT,
  ],
};

const PV_FRAMEWORKS: Record<PvRegion, PvFramework> = {
  FDA: FDA_FRAMEWORK,
  EU: EU_FRAMEWORK,
};

/**
 * Get the process-validation framework (model, stages, approaches) for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getProcessValidationFramework(region: PvRegion): PvFramework {
  const framework = PV_FRAMEWORKS[region];
  if (!framework) {
    throw new Error(`No process-validation framework modeled for region "${region}".`);
  }
  return framework;
}

/**
 * Get a single framework stage by its id within a region.
 * Pure / deterministic. Throws for an unmodeled region or an unknown stage id.
 */
export function getValidationStage(region: PvRegion, stageId: string): PvStage {
  const framework = getProcessValidationFramework(region);
  const stage = framework.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new Error(`Unknown stage id "${stageId}" for region "${region}".`);
  }
  return stage;
}
