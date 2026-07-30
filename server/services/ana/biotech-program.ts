/**
 * Biotech program orchestrator — the biologics/advanced-therapy development
 * spine that turns "where does my program stand and what is next" into a
 * concrete, modality-aware answer.
 *
 * The client journey (client-journey.ts) reads platform-engagement state
 * (license → project → authoring → review → submission). This module maps that,
 * plus an explicit development-phase hint, onto the REGULATORY development arc a
 * biotech program actually runs — discovery → IND-enabling → Phase 1/2/3 → BLA
 * filing → post-approval — and for each phase names the objective, the load-
 * bearing deliverables, the regulatory gates, the CTD modules in play, and the
 * exact AnA tools to reach for next. A modality overlay (mAb, gene/cell therapy,
 * vaccine, biosimilar) surfaces the critical-path risk that modality lives or
 * dies on.
 *
 * Design properties, matching the rest of the AnA surface:
 *   - pure + deterministic core (buildBiotechProgramStatus is I/O-free and unit-
 *     tested); the tool handler is the only impure seam (it reads the journey).
 *   - honest about provenance: the resolved phase is tagged 'hint' when the
 *     caller supplied it and 'inferred_from_journey' when it was derived from
 *     platform state, so AnA never asserts a development phase it does not know.
 *   - fail-soft: an unknown org or a failed journey read still yields a valid
 *     earliest-phase orientation instead of an error.
 *   - inject-and-sibling registration (registerBiotechProgramHandlers(register))
 *     so there is no runtime import cycle with AnaToolExecutor; ToolContext is a
 *     type-only (erased) import.
 *
 * @module server/services/ana/biotech-program
 */

import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor.js';
import type { ClientJourneyStage } from './client-journey.js';

// ─────────────────────────────────────────────────────────────────────────────
// Domain taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/** The regulatory development arc for a biologics program. */
export type BiotechProgramPhase =
  | 'discovery'
  | 'ind_enabling'
  | 'clinical_early' // Phase 1
  | 'clinical_mid' // Phase 2
  | 'clinical_late' // Phase 3 / pivotal
  | 'bla_filing'
  | 'post_approval';

export const BIOTECH_PROGRAM_PHASES: BiotechProgramPhase[] = [
  'discovery',
  'ind_enabling',
  'clinical_early',
  'clinical_mid',
  'clinical_late',
  'bla_filing',
  'post_approval',
];

export const PHASE_LABELS: Record<BiotechProgramPhase, string> = {
  discovery: 'Discovery / target validation',
  ind_enabling: 'IND-enabling (nonclinical + CMC to first-in-human)',
  clinical_early: 'Phase 1 (first-in-human)',
  clinical_mid: 'Phase 2 (proof of concept + dose)',
  clinical_late: 'Phase 3 / pivotal',
  bla_filing: 'BLA / NDA filing and review',
  post_approval: 'Post-approval lifecycle',
};

/** Product modality — drives the critical-path overlay. */
export type BiotechModality =
  | 'monoclonal_antibody'
  | 'recombinant_protein'
  | 'gene_therapy'
  | 'cell_therapy'
  | 'vaccine'
  | 'biosimilar'
  | 'other';

export const MODALITY_LABELS: Record<BiotechModality, string> = {
  monoclonal_antibody: 'Monoclonal antibody',
  recombinant_protein: 'Recombinant / fusion protein',
  gene_therapy: 'Gene therapy',
  cell_therapy: 'Cell therapy',
  vaccine: 'Vaccine',
  biosimilar: 'Biosimilar (351(k))',
  other: 'Biologic (unspecified modality)',
};

// ─────────────────────────────────────────────────────────────────────────────
// The program spine — one entry per phase
// ─────────────────────────────────────────────────────────────────────────────

export interface PhaseSpine {
  /** What the phase exists to achieve. */
  objective: string;
  /** The load-bearing deliverables that define done for the phase. */
  keyDeliverables: string[];
  /** The regulatory gates and interactions this phase must clear. */
  regulatoryGates: string[];
  /** CTD modules the work lands in (empty pre-CTD). */
  ctdFocus: string[];
  /** Concrete AnA tools/actions to reach for now (tool names). */
  anaCanDoNow: string[];
  /** The single milestone that ends the phase. */
  nextMilestone: string;
  /** The phase that follows (null at the end of the arc). */
  nextPhase: BiotechProgramPhase | null;
}

export const BIOTECH_PROGRAM_SPINE: Record<BiotechProgramPhase, PhaseSpine> = {
  discovery: {
    objective:
      'Validate the target and lead candidate, establish developability, and commit to a target product profile and a regulatory pathway before spending nonclinical money.',
    keyDeliverables: [
      'Target product profile (the label you intend to earn)',
      'Target validation dossier',
      'Lead-candidate developability assessment',
      'Initial regulatory pathway hypothesis and competitive landscape',
    ],
    regulatoryGates: ['No regulatory filing yet — this is the pre-regulatory foundation'],
    ctdFocus: [],
    anaCanDoNow: [
      'search_chembl_compound',
      'assess_developability',
      'assess_regulatory_landscape',
      'search_literature',
      'start_intelligence_flow (project_setup)',
    ],
    nextMilestone: 'Lock the target product profile and select the regulatory pathway',
    nextPhase: 'ind_enabling',
  },
  ind_enabling: {
    objective:
      'Complete the nonclinical package and the Phase-1 CMC that support first-in-human, align with FDA at a pre-IND meeting, and file an IND that does not draw a clinical hold.',
    keyDeliverables: [
      'GLP toxicology program and first-in-human dose rationale',
      'Phase 1 protocol and Investigator’s Brochure',
      'IND CMC package (Module 3 to Phase-1 level)',
      'Pre-IND briefing package',
    ],
    regulatoryGates: [
      'Pre-IND (Type B) meeting',
      'IND submission with a 30-day review',
      'Avoid a clinical hold under 21 CFR 312.42',
    ],
    ctdFocus: ['M2.3 QOS', 'M2.4 nonclinical overview', 'M2.6 nonclinical summaries', 'M3 quality', 'M4 study reports'],
    anaCanDoNow: [
      'compute_fih_dose',
      'classify_tox_findings',
      'assess_nonclinical_program',
      'draft_nonclinical_overview_m2_4',
      'plan_ind_module_authoring',
      'build_pre_ind_package',
      'assess_ind_readiness',
    ],
    nextMilestone: 'Hold the pre-IND meeting and file the IND without a clinical hold',
    nextPhase: 'clinical_early',
  },
  clinical_early: {
    objective:
      'Establish safety, tolerability, PK, and a preliminary dose in first-in-human, and read the data cleanly enough to design Phase 2.',
    keyDeliverables: [
      'Phase 1 CSR',
      'PK characterization',
      'Initial immunogenicity read',
      'Dose-escalation / MTD or recommended dose',
    ],
    regulatoryGates: [
      'IND safety reporting on the four-factor determination (21 CFR 312.32)',
      'Protocol amendments as the design evolves',
    ],
    ctdFocus: ['M5.3.3 (PK)', 'M5.3.5 (CSRs)'],
    anaCanDoNow: [
      'characterize_pk',
      'assess_immunogenicity',
      'compute_sample_size',
      'advise_estimand',
      'draft_safety_narrative',
    ],
    nextMilestone: 'Define the Phase 2 dose and design from the Phase 1 read',
    nextPhase: 'clinical_mid',
  },
  clinical_mid: {
    objective:
      'Establish proof of concept and the dose for the pivotal, secure any expedited designation, and lock the pivotal design at End-of-Phase-2.',
    keyDeliverables: [
      'Phase 2 CSR and dose-response',
      'Pivotal protocol and SAP',
      'End-of-Phase-2 briefing package',
      'Pediatric study plan timing (iPSP / PIP)',
    ],
    regulatoryGates: [
      'End-of-Phase-2 (Type B) meeting',
      'Expedited-designation requests (Breakthrough, Fast Track) where warranted',
      'Orphan designation if applicable',
    ],
    ctdFocus: ['M5.3.5 CSRs', 'M2.5 clinical overview (emerging)'],
    anaCanDoNow: [
      'select_exposure_response_dose',
      'compute_sample_size',
      'advise_study_design',
      'generate_statistical_document (SAP)',
      'advise_special_designation',
      'plan_orphan_drug_designation',
    ],
    nextMilestone: 'Lock the pivotal design at End-of-Phase-2 and start Phase 3',
    nextPhase: 'clinical_late',
  },
  clinical_late: {
    objective:
      'Generate the confirmatory efficacy and safety evidence for the label, lock the commercial CMC process before the pivotal, and reach a file-ready package.',
    keyDeliverables: [
      'Pivotal CSR(s)',
      'Integrated summaries of safety and effectiveness (ISS / ISE)',
      'Commercial process validation (PPQ) and stability package',
      'Pre-BLA / pre-NDA briefing package',
    ],
    regulatoryGates: [
      'Pre-BLA / pre-NDA meeting',
      'Safety database adequacy (ICH E1)',
      'Process lock before the pivotal to avoid a comparability burden',
    ],
    ctdFocus: ['M5 CSRs + integrated summaries', 'M2.5 / M2.7 summaries', 'M3 commercial CMC'],
    anaCanDoNow: [
      'assess_comparability',
      'assess_analytical_similarity',
      'assess_immunogenicity',
      'reconcile_module2_numbers',
      'assess_bla_filing_risk',
      'run_submission_premortem',
      'build_pre_ind_package (pre-BLA meeting)',
    ],
    nextMilestone: 'Pass the pre-BLA meeting and assemble a file-ready BLA / NDA',
    nextPhase: 'bla_filing',
  },
  bla_filing: {
    objective:
      'Assemble, validate, and transmit a file-ready BLA/NDA, clear the refuse-to-file window, and manage the review cycle to approval.',
    keyDeliverables: [
      'Complete eCTD (M1–M5)',
      'ISS / ISE and Module 2 summaries that reconcile with the datasets',
      'Financial disclosures and pediatric plan complete',
      'A clean filing checklist against the refuse-to-file criteria',
    ],
    regulatoryGates: [
      'Refuse-to-file window (first 60 days)',
      'Filing review, mid-cycle, and any advisory committee',
      'PDUFA action date',
    ],
    ctdFocus: ['All modules M1–M5'],
    anaCanDoNow: [
      'assess_bla_filing_risk',
      'run_submission_premortem',
      'validate_ectd_package',
      'check_ectd_cross_references',
      'scan_regulatory_deficiencies',
      'assemble_briefing_book',
    ],
    nextMilestone: 'File, clear refuse-to-file, and drive the review cycle to approval',
    nextPhase: 'post_approval',
  },
  post_approval: {
    objective:
      'Maintain the license, meet post-marketing commitments, and manage lifecycle changes in the correct reporting category.',
    keyDeliverables: [
      'REMS where a risk requires it',
      'Post-marketing study protocols and commitment tracking',
      'PBRER / PSUR on cadence',
      'Variation / supplement filings classified correctly',
    ],
    regulatoryGates: [
      'Post-marketing requirements and commitments',
      'Periodic safety reporting cadence (PBRER / PADER)',
      'Change classification (PAS / CBE-30 / CBE-0 / annual report)',
    ],
    ctdFocus: ['M1 labeling / REMS', 'M3 post-approval changes', 'safety updates'],
    anaCanDoNow: [
      'advise_pharmacovigilance',
      'draft_safety_narrative',
      'review_label_currency',
      'create_lifecycle_obligation',
      'review_lifecycle_calendar',
    ],
    nextMilestone: 'Keep commitments on the calendar and file changes in the right reporting category',
    nextPhase: null,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Modality overlay — the critical-path risk each modality lives or dies on
// ─────────────────────────────────────────────────────────────────────────────

export const MODALITY_CRITICAL_PATH: Record<BiotechModality, string[]> = {
  monoclonal_antibody: [
    'Immunogenicity risk assessment across the program',
    'Comparability across every process and site change (ICH Q5E)',
    'Host-cell-protein and aggregate control as CQAs',
  ],
  recombinant_protein: [
    'Aggregation and immunogenicity control',
    'A qualified, stability-indicating potency assay',
    'Comparability after any manufacturing change',
  ],
  gene_therapy: [
    'The potency assay is the single point of failure — build it early',
    'Vector characterization plus RCR/RCL and shedding assessment',
    'Long-term follow-up (up to 15 years) designed into the clinical plan',
    'Comparability after a process change can approach a new characterization package',
  ],
  cell_therapy: [
    'Potency and identity of a living product with a short shelf-life',
    'Chain-of-identity and chain-of-custody for an autologous product',
    'The manufacturing process effectively defines the product',
  ],
  vaccine: [
    'Potency and lot-to-lot consistency',
    'CBER lot-release strategy',
    'Adjuvant characterization and control',
  ],
  biosimilar: [
    'Analytical similarity is the foundation of the totality of evidence',
    'A stepwise 351(k) program that resolves residual uncertainty',
    'A comparative clinical study only where analytical + PK leave a gap',
  ],
  other: [
    'A qualified potency assay tied to mechanism of action',
    'Comparability across manufacturing changes (ICH Q5E)',
    'Immunogenicity assessment appropriate to the product',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolution helpers (pure)
// ─────────────────────────────────────────────────────────────────────────────

const MODALITY_ALIASES: Record<string, BiotechModality> = {
  mab: 'monoclonal_antibody',
  monoclonal: 'monoclonal_antibody',
  monoclonal_antibody: 'monoclonal_antibody',
  antibody: 'monoclonal_antibody',
  adc: 'monoclonal_antibody',
  bispecific: 'monoclonal_antibody',
  fusion_protein: 'recombinant_protein',
  recombinant: 'recombinant_protein',
  recombinant_protein: 'recombinant_protein',
  protein: 'recombinant_protein',
  enzyme: 'recombinant_protein',
  gene_therapy: 'gene_therapy',
  gene: 'gene_therapy',
  aav: 'gene_therapy',
  gene_editing: 'gene_therapy',
  crispr: 'gene_therapy',
  cell_therapy: 'cell_therapy',
  cell: 'cell_therapy',
  car_t: 'cell_therapy',
  'car-t': 'cell_therapy',
  cart: 'cell_therapy',
  tcr: 'cell_therapy',
  vaccine: 'vaccine',
  mrna: 'vaccine',
  biosimilar: 'biosimilar',
  '351k': 'biosimilar',
  '351(k)': 'biosimilar',
};

/** Normalize a free-text modality hint to a known modality (default 'other'). */
export function normalizeModality(input?: string | null): BiotechModality {
  if (typeof input !== 'string') return 'other';
  const key = input.trim().toLowerCase().replace(/\s+/g, '_');
  if (key in MODALITY_ALIASES) return MODALITY_ALIASES[key];
  if (key in MODALITY_LABELS) return key as BiotechModality;
  return 'other';
}

const PHASE_ALIASES: Record<string, BiotechProgramPhase> = {
  discovery: 'discovery',
  target: 'discovery',
  lead: 'discovery',
  preclinical: 'ind_enabling',
  ind_enabling: 'ind_enabling',
  'ind-enabling': 'ind_enabling',
  ind: 'ind_enabling',
  pre_ind: 'ind_enabling',
  nonclinical: 'ind_enabling',
  phase_1: 'clinical_early',
  phase1: 'clinical_early',
  'phase-1': 'clinical_early',
  fih: 'clinical_early',
  clinical_early: 'clinical_early',
  phase_2: 'clinical_mid',
  phase2: 'clinical_mid',
  'phase-2': 'clinical_mid',
  clinical_mid: 'clinical_mid',
  phase_3: 'clinical_late',
  phase3: 'clinical_late',
  'phase-3': 'clinical_late',
  pivotal: 'clinical_late',
  clinical_late: 'clinical_late',
  bla: 'bla_filing',
  nda: 'bla_filing',
  bla_filing: 'bla_filing',
  filing: 'bla_filing',
  submission: 'bla_filing',
  post_approval: 'post_approval',
  'post-approval': 'post_approval',
  approved: 'post_approval',
  marketed: 'post_approval',
  lifecycle: 'post_approval',
};

/** Normalize a free-text development-phase hint to a known phase, or null. */
export function normalizeProgramPhase(input?: string | null): BiotechProgramPhase | null {
  if (typeof input !== 'string') return null;
  const key = input.trim().toLowerCase().replace(/\s+/g, '_');
  return PHASE_ALIASES[key] ?? null;
}

/**
 * Coarse fallback: infer a development phase from the platform-engagement
 * journey stage when the caller gives no explicit hint. This is deliberately
 * weak — journey stage measures platform engagement, not development phase — so
 * the result is tagged 'inferred_from_journey' and AnA is told to confirm it.
 */
export function inferPhaseFromJourneyStage(stage: ClientJourneyStage): BiotechProgramPhase {
  switch (stage) {
    case 'just_licensed':
    case 'onboarding':
      return 'discovery';
    case 'project_started':
    case 'authoring':
      return 'ind_enabling';
    case 'in_review':
      return 'clinical_late';
    case 'submission_ready':
      return 'bla_filing';
    case 'submitted':
      return 'post_approval';
    default:
      return 'discovery';
  }
}

export type PhaseSource = 'hint' | 'inferred_from_journey';

export interface BiotechProgramStatusInput {
  journeyStage: ClientJourneyStage;
  modality?: string | null;
  phaseHint?: string | null;
  indication?: string | null;
}

export interface BiotechProgramStatus {
  source: string;
  modality: BiotechModality;
  modalityLabel: string;
  indication: string | null;
  phase: BiotechProgramPhase;
  phaseLabel: string;
  phaseSource: PhaseSource;
  journeyStage: ClientJourneyStage;
  objective: string;
  keyDeliverables: string[];
  regulatoryGates: string[];
  ctdFocus: string[];
  criticalPath: string[];
  anaCanDoNow: string[];
  nextMilestone: string;
  nextPhase: BiotechProgramPhase | null;
  nextPhaseLabel: string | null;
  /** Guidance AnA should honor when narrating this status. */
  guidance: string;
}

/**
 * Pure assembler: given the journey stage plus optional modality/phase hints,
 * produce the full biotech program status. I/O-free and deterministic.
 */
export function buildBiotechProgramStatus(input: BiotechProgramStatusInput): BiotechProgramStatus {
  const modality = normalizeModality(input.modality);
  const hinted = normalizeProgramPhase(input.phaseHint);
  const phase = hinted ?? inferPhaseFromJourneyStage(input.journeyStage);
  const phaseSource: PhaseSource = hinted ? 'hint' : 'inferred_from_journey';
  const spine = BIOTECH_PROGRAM_SPINE[phase];
  const indication = typeof input.indication === 'string' && input.indication.trim() ? input.indication.trim() : null;

  const guidance =
    phaseSource === 'inferred_from_journey'
      ? 'The development phase here was inferred from platform-engagement state, not stated by the user. Confirm the actual phase before committing to phase-specific advice, then lead with the single next milestone.'
      : 'Lead with the single next milestone and the one or two deliverables that gate it. Fold in the modality critical-path risk only where it bears on the current work.';

  return {
    source: 'AnA biotech program orchestrator',
    modality,
    modalityLabel: MODALITY_LABELS[modality],
    indication,
    phase,
    phaseLabel: PHASE_LABELS[phase],
    phaseSource,
    journeyStage: input.journeyStage,
    objective: spine.objective,
    keyDeliverables: spine.keyDeliverables,
    regulatoryGates: spine.regulatoryGates,
    ctdFocus: spine.ctdFocus,
    criticalPath: MODALITY_CRITICAL_PATH[modality],
    anaCanDoNow: spine.anaCanDoNow,
    nextMilestone: spine.nextMilestone,
    nextPhase: spine.nextPhase,
    nextPhaseLabel: spine.nextPhase ? PHASE_LABELS[spine.nextPhase] : null,
    guidance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definition
// ─────────────────────────────────────────────────────────────────────────────

export const GET_BIOTECH_PROGRAM_STATUS: AnaTool = {
  name: 'get_biotech_program_status',
  description:
    "Orient a BIOTECH (biologics, cell/gene therapy, vaccine, biosimilar) program on the regulatory development arc — discovery, IND-enabling, Phase 1/2/3, BLA/NDA filing, post-approval — and get the concrete next move. Returns the current development phase (with whether it was stated or inferred), the objective of that phase, the load-bearing deliverables, the regulatory gates and CTD modules in play, the modality-specific critical-path risk (e.g. the potency assay for a gene therapy, analytical similarity for a biosimilar), the single next milestone, and the exact AnA tools to reach for now. Use this to answer 'what do I need to do', 'where does my biologics program stand', 'what's next for my BLA', or to plan a biotech program end-to-end. Pass the modality and the development phase when you know them from the conversation; when you do not, it infers a coarse phase from the client's platform state and tells you to confirm it. Reads the client's live journey state; deterministic, never invents program facts.",
  input_schema: {
    type: 'object',
    properties: {
      modality: {
        type: 'string',
        description:
          "Product modality when known: 'monoclonal_antibody', 'recombinant_protein', 'gene_therapy', 'cell_therapy', 'vaccine', 'biosimilar' (aliases like 'mAb', 'CAR-T', 'AAV', 'mRNA' are accepted). Omit if unknown.",
      },
      phase: {
        type: 'string',
        description:
          "Development phase when known: 'discovery', 'ind_enabling', 'phase_1', 'phase_2', 'phase_3'/'pivotal', 'bla'/'nda', or 'post_approval'. Omit to infer a coarse phase from platform state.",
      },
      indication: {
        type: 'string',
        description: 'Optional target indication, to tailor the framing.',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler registration (injected register avoids an import cycle)
// ─────────────────────────────────────────────────────────────────────────────

type RegisterFn = (
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) => void;

/** Register the biotech-program tool handlers on the executor's registry. */
export function registerBiotechProgramHandlers(register: RegisterFn): void {
  register('get_biotech_program_status', async (input, ctx) => {
    const orgId = ctx?.organizationId ?? null;
    try {
      const { getClientJourney, describeClientJourney } = await import('./client-journey.js');
      const { getPool } = await import('../../db.js');
      const journey =
        orgId != null
          ? await getClientJourney(getPool(), orgId, { segment: 'biotech' })
          : describeClientJourney('just_licensed', { segment: 'biotech' });

      const status = buildBiotechProgramStatus({
        journeyStage: journey.stage,
        modality: typeof input.modality === 'string' ? input.modality : null,
        phaseHint: typeof input.phase === 'string' ? input.phase : null,
        indication: typeof input.indication === 'string' ? input.indication : null,
      });

      return JSON.stringify({ ...status, journey });
    } catch (error: any) {
      // Fail-soft: still orient at the earliest phase rather than erroring out.
      const status = buildBiotechProgramStatus({
        journeyStage: 'just_licensed',
        modality: typeof input.modality === 'string' ? input.modality : null,
        phaseHint: typeof input.phase === 'string' ? input.phase : null,
        indication: typeof input.indication === 'string' ? input.indication : null,
      });
      return JSON.stringify({
        ...status,
        note: `Could not read live program state (${error?.message ?? 'unknown error'}); oriented at the earliest phase. Confirm the actual phase with the user.`,
      });
    }
  });
}
