/**
 * Project map — ONE project flow configured by the selected document type.
 *
 * FOUNDER CLARIFICATION (2026-11-02)
 * CSR is a document choice in Project Management, not a separate CSR module.
 * IND, BLA and CTD likewise do not introduce separate applications, editors or
 * data rooms. The selected project document/filing definition changes the
 * questions, evidence requirements, outline and applicable actions inside the
 * same system. "Biotech" describes client/product context, not a separate
 * customer-facing workspace or workflow.
 *
 * IMPLEMENTATION SCOPE — FINISH WHAT EXISTS (founder clarification, 2026-11-02)
 * "Don't build anything new but faux data but you can complete and finish
 * unfinished code and features anywhere."
 * - New demonstration content is permitted: clearly fictional clients,
 *   projects, studies, datasets and example documents, using the existing
 *   authorized creation/ingestion paths. Synthetic content is not real clinical
 *   evidence, an executed review, an electronic signature or a filing receipt.
 * - Completion is platform-wide, not limited to CSR or demo data. Repair,
 *   connect, finish and test existing features wherever they are unfinished,
 *   broken or unreachable. This includes implementing missing code within their
 *   existing owners; it is not a restriction to documentation or data edits.
 * - Search and name the existing implementation first. Reuse its UI, services,
 *   records and contracts. Do not introduce new product capabilities, parallel
 *   modules, services, routes, tables, editors, data rooms or workflows under
 *   the label of completion. Keep the existing design/plan and coordination.
 * - Bring that existing functionality into the shared project journey below.
 *   Preserve authorization, source identity, history, review and signature
 *   controls. Verify the actual user path; a commit or synthetic dataset alone
 *   does not establish a working, populated or qualified demonstration.
 *
 * The user journey this map must guide:
 * 1. PROJECT MANAGEMENT: choose the document/filing type and define the goal,
 *    hypothesis, trial/protocol context, team and relevant project history.
 *    Retain the source and history of those facts; do not invent missing facts.
 * 2. GUIDED DEFINITION: present accompanying choices and questions appropriate
 *    to that type and the recorded context. Reuse recorded answers and expose
 *    unknowns. Do not send the user into a separate type-specific application.
 * 3. DATA ROOM: files uploaded in the project enter its existing governed data
 *    catalog, with originals, versions, classification, processing status and
 *    lineage. Link requirements and derived evidence to those catalog records.
 *    An upload is not, by itself, proof of standards conformance or approval.
 * 4. EVIDENCE: the existing applicable engines use the project's authorized
 *    sources. Preserve source/run/version identity and missing-data findings.
 * 5. CANVAS + ONE EDITOR + AnA: use the same document-building environment for
 *    every type. Its outline, templates, questions and tools adapt to the
 *    selected type. People can author directly or direct AnA; neither path
 *    creates a parallel document store, generator or editor.
 * 6. SHARED LIFECYCLE: tasks, communication, review, comments, versions and
 *    signatures stay linked to that project and document. Export/filing uses
 *    the existing applicable path; a document project is not automatically a
 *    complete regulatory submission.
 *
 * Canonical placement and implementation owners:
 * .design/client-journey/INFORMATION_ARCHITECTURE.md
 * docs/design/ONE_DESIGN_PLAN.md
 *
 * Internal names such as WorkspaceConfig, apps and clinical_csr are retained
 * compatibility identifiers for existing capabilities, NOT permission to create
 * separate CSR/IND/BLA/CTD product modules. CTD content-module numbers are not
 * separate application modules. Do not rename or remove existing capabilities
 * merely to match this wording; finish their reachable shared-flow owners.
 *
 * This pure resolver supplies milestones/capability metadata. It does not
 * itself implement the guided forms, ingestion, editor, authorization or human
 * review. The journey above is the governing direction and acceptance path,
 * not a claim that every UI hand-off has already been implemented or verified.
 *
 * `resolveWorkspaceConfig(need)` answers "what abilities does this document type
 * need" as a flat set. It does not answer "WHEN is each one needed." This module
 * turns that config and its claim spine into ordered MILESTONES and a CAPABILITY
 * INVENTORY for project setup and AnA's contextual next-step guidance.
 *
 * Derived, not hand-enumerated: phases come from the evidence claim spine
 * (`cfg.program.requiredClaims`) plus structural framing phases (strategy /
 * assembly / submission / review / post-market). Pure, no DB.
 *
 * This is the CROSS-SEGMENT, qualitative scaffold (all ~190 document types:
 * which capabilities at which phase). It complements the IVD-specific
 * quantitative engine in `server/services/regulatory/program-plan.ts`
 * (`buildProgramPlan`: classification → CDx pairing → study design → reviewer
 * simulation → Monte-Carlo timeline/cost). That engine can fill quantitative
 * detail into an IVD project's phases without creating a separate user journey.
 *
 * @module shared/regulatory/project-map
 */

import { resolveWorkspaceConfig } from './workspace-config.js';
import type { WorkspaceConfigInput, WorkspaceConfig } from './workspace-config.js';
import type { WorkspaceAppId } from './app-registry.js';
import { getApp } from './app-registry.js';
import type { WorkspaceServiceId } from './workspace-config.js';
import type { ClientSegmentId } from './client-segments.js';
import { standardsForSegment } from './client-segments.js';
import type { StandardId, StandardBody, StandardDomain } from './standards-registry.js';
import { meetingsForSegment } from './agency-interaction.js';

// ─── Phases — the ordered spine of a regulatory program ──────────────────────

export type ProjectPhase =
  | 'strategy'      // plan the pathway, de-risk, align with the agency
  | 'quality'       // CMC / analytical characterization (Module 3 / IVD analytical)
  | 'nonclinical'   // nonclinical safety (Module 4)
  | 'clinical'      // pivotal clinical / performance evidence (Module 5 / device perf)
  | 'authoring'     // summaries + labeling
  | 'assembly'      // assemble + cross-check + validate the dossier
  | 'submission'    // transmit through the regional gateway
  | 'review'        // agency review clock, meetings, deficiency responses
  | 'post_market';  // surveillance, commitments, variations, renewals

/** Phases in execution order; the index is the milestone ordinal. */
export const PHASE_ORDER: ProjectPhase[] = [
  'strategy', 'quality', 'nonclinical', 'clinical',
  'authoring', 'assembly', 'submission', 'review', 'post_market',
];

const PHASE_META: Record<ProjectPhase, { title: string; purpose: string }> = {
  strategy: {
    title: 'Strategy & Planning',
    purpose: 'Define the regulatory pathway, de-risk it, and align with the agency before generating evidence.',
  },
  quality: {
    title: 'Quality / CMC & Analytical',
    purpose: 'Establish that the product is characterized and manufacturing / the assay is controlled.',
  },
  nonclinical: {
    title: 'Nonclinical',
    purpose: 'Establish nonclinical safety (pharmacology, toxicology).',
  },
  clinical: {
    title: 'Clinical / Performance Evidence',
    purpose: 'Generate the pivotal evidence that supports the core claim.',
  },
  authoring: {
    title: 'Authoring & Labeling',
    purpose: 'Author the summaries and labeling that present the evidence.',
  },
  assembly: {
    title: 'Dossier Assembly',
    purpose: 'Assemble, cross-check, and validate the submission package.',
  },
  submission: {
    title: 'Submission & Gateway',
    purpose: 'Transmit the dossier to the agency through the regional gateway.',
  },
  review: {
    title: 'Agency Review & Interaction',
    purpose: 'Manage the review clock, meetings, and deficiency responses.',
  },
  post_market: {
    title: 'Post-Market & Lifecycle',
    purpose: 'Surveillance, commitments, variations, and renewals after approval.',
  },
};

// ─── Capability → phase mapping ──────────────────────────────────────────────

/**
 * The phase(s) at which each app becomes relevant. Most apps anchor to one
 * phase; a few genuinely span (the submission center assembles AND transmits;
 * risk management is opened in evidence but lives across the lifecycle).
 */
const APP_PHASES: Record<WorkspaceAppId, ProjectPhase[]> = {
  cmc: ['quality'],
  analytical_performance: ['quality'],
  analytical_similarity: ['quality'],
  nonclinical: ['nonclinical'],
  iacuc: ['nonclinical'],
  study_protocol_design: ['clinical'],
  irb: ['clinical'],
  ibc: ['clinical'],
  biostatistics: ['clinical'],
  clinical_csr: ['clinical'],
  cer: ['clinical'],
  etmf: ['clinical'],
  risk: ['clinical', 'post_market'],
  human_factors: ['clinical'],
  cybersecurity: ['clinical', 'post_market'],
  substantial_equiv: ['clinical'],
  labeling: ['authoring'],
  submission_center: ['assembly', 'submission'],
  pharmacovigilance: ['post_market'],
  market_access: ['post_market'],
};

/** The phase at which each service is primarily drawn on. */
const SERVICE_PHASES: Record<WorkspaceServiceId, ProjectPhase[]> = {
  knowledge_base: ['strategy'],
  regulatory_intelligence: ['strategy', 'review'],
  precedent_intelligence: ['strategy'],
  substantial_equivalence_check: ['strategy', 'clinical'],
  literature_search: ['clinical'],
  evidence_search: ['clinical'],
  cdisc_validation: ['clinical'],
  statistical_defensibility: ['clinical'],
  cross_artifact_intelligence: ['assembly'],
  readiness_assessment: ['assembly'],
  external_intelligence: ['submission', 'review'],
  compliance_calendar: ['clinical', 'post_market'],
  change_control: ['clinical', 'post_market'],
  health_economics: ['strategy', 'post_market'],
  special_designations: ['strategy'],
  pediatric_intelligence: ['strategy', 'clinical'],
  inspection_readiness: ['quality', 'review'],
  controlled_substances: ['strategy', 'clinical'],
  cdx_intelligence: ['strategy', 'clinical'],
  financial_disclosures: ['clinical'],
  cmc_consistency: ['quality', 'assembly'],
  dose_optimization: ['clinical'],
  effort_certification: ['clinical'],
  study_design_judgment: ['clinical'],
  nonclinical_send: ['nonclinical'],
  estimand_framework: ['clinical'],
  endpoint_intelligence: ['strategy', 'clinical'],
  contradiction_detection: ['assembly', 'review'],
  biologics_pathway: ['strategy', 'quality'],
  combination_product: ['strategy'],
  rwe_analytics: ['clinical', 'post_market'],
  external_control_arm: ['clinical'],
  outcome_prediction: ['strategy', 'clinical'],
  adaptive_trial_operations: ['clinical'],
  fih_dose_derivation: ['nonclinical'],
  reviewer_simulation: ['assembly', 'review'],
  analytical_method_validation: ['quality'],
};

/** The phase each evidence claim (from the claim spine) is built in. */
const CLAIM_PHASES: Record<string, ProjectPhase> = {
  quality: 'quality',
  device_description: 'quality',
  analytical_performance: 'quality',
  quality_similarity: 'quality',
  nonclinical_safety: 'nonclinical',
  efficacy: 'clinical',
  clinical_performance: 'clinical',
  clinical_safety: 'clinical',
  residual_clinical: 'clinical',
  substantial_equivalence: 'clinical',
  performance_bench: 'clinical',
  safety_biocompat: 'clinical',
  labeling: 'authoring',
};

/** The phase(s) at which each standard domain applies. */
const DOMAIN_PHASES: Record<StandardDomain, ProjectPhase[]> = {
  quality_system: ['quality'],
  risk: ['clinical', 'post_market'],
  software: ['quality', 'clinical'],
  human_factors: ['clinical'],
  cybersecurity: ['clinical', 'post_market'],
  analytical_performance: ['quality'],
  cmc_biologic: ['quality'],
  cmc_chemistry: ['quality'],
  nonclinical: ['nonclinical'],
  clinical: ['clinical'],
  regulation: ['strategy', 'submission', 'review'],
};

/** Structural deliverables a phase contributes beyond the claim spine. */
const FRAMING_DELIVERABLES: Partial<Record<ProjectPhase, string[]>> = {
  strategy: ['Regulatory strategy', 'Pre-submission meeting'],
  assembly: ['Assembled submission bundle', 'Cross-artifact validation'],
  submission: ['Gateway transmittal', 'Acknowledgement / receipt'],
  review: ['Agency questions / deficiency responses'],
  post_market: ['Pharmacovigilance / periodic safety report', 'Commitments & variations'],
};

// ─── Output shapes ───────────────────────────────────────────────────────────

export interface MilestoneStandard {
  id: StandardId;
  designation: string;
  body: StandardBody;
  currentVersion: string;
  domain: StandardDomain;
}

export interface ProjectMilestone {
  /** Stable milestone id (`<phase>`). */
  id: ProjectPhase;
  phase: ProjectPhase;
  /** Position in the project map (0-based, dense over emitted milestones). */
  ordinal: number;
  title: string;
  purpose: string;
  /** Apps needed at this milestone (intersected with what's in scope). */
  apps: { id: WorkspaceAppId; label: string }[];
  /** Services drawn on at this milestone (intersected with what's in scope). */
  services: WorkspaceServiceId[];
  /** Sub-claims argued in this phase (from the evidence spine). */
  objectives: { id: string; label: string }[];
  /** Concrete deliverables produced (claim section targets + framing). */
  deliverables: string[];
  /** Standards in force at this milestone (segment corpus filtered by domain→phase). */
  standards: MilestoneStandard[];
  /** The transmit target, on the submission milestone only. */
  gateway: { region: string } | null;
}

export interface InventoryItem<T> {
  id: T;
  label: string;
  /** Phases (in order) at which this capability is needed. */
  neededAtPhases: ProjectPhase[];
  /** The earliest phase it is needed — "when do we first reach for it". */
  firstNeededPhase: ProjectPhase;
}

export interface CapabilityInventory {
  apps: InventoryItem<WorkspaceAppId>[];
  services: InventoryItem<WorkspaceServiceId>[];
}

export interface ProjectMap {
  need: string;
  known: boolean;
  scope: WorkspaceConfig['scope'];
  segment: string | null;
  evidenceModel: string | null;
  /** The ordered project map. */
  milestones: ProjectMilestone[];
  /** Every capability the project needs, and when. */
  inventory: CapabilityInventory;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

const REGISTRATION_FAMILIES = new Set([
  'marketing_authorization', 'device_approval', 'device_clearance', 'companion_diagnostic',
]);

/** Which phases are emitted for this config (those with real content). */
function phasesFor(cfg: WorkspaceConfig, availableApps: Set<WorkspaceAppId>): Set<ProjectPhase> {
  const family = cfg.resolved?.applicationFamily ?? null;
  const isDossier = cfg.scope === 'dossier';
  const claims = cfg.program?.requiredClaims ?? [];

  const emitted = new Set<ProjectPhase>();

  // A regulatory selection always opens with a strategy phase.
  if (cfg.known) emitted.add('strategy');

  // Evidence phases: emit when the claim spine puts a claim there, or when an
  // available app anchors there.
  for (const c of claims) {
    const ph = CLAIM_PHASES[c.id];
    if (ph) emitted.add(ph);
  }
  for (const appId of availableApps) {
    for (const ph of APP_PHASES[appId]) {
      // Structural phases (assembly/submission/review/post_market) are gated below.
      if (ph === 'quality' || ph === 'nonclinical' || ph === 'clinical' || ph === 'authoring') {
        emitted.add(ph);
      }
    }
  }

  // Structural phases.
  if (isDossier) {
    emitted.add('assembly');
    if (cfg.gateway) emitted.add('submission');
    emitted.add('review');
  }

  // Post-market: anything that creates / maintains a registration, carries a
  // surveillance app, or is itself a safety record.
  if (
    (family && REGISTRATION_FAMILIES.has(family)) ||
    family === 'safety_report' ||
    availableApps.has('pharmacovigilance') ||
    availableApps.has('market_access')
  ) {
    emitted.add('post_market');
  }

  return emitted;
}

/**
 * Resolve the project map + capability inventory for a selected document type.
 * Accepts the same input as `resolveWorkspaceConfig` (string need, or
 * `{ need, clientType?, region? }`).
 */
export function resolveProjectMap(input: WorkspaceConfigInput): ProjectMap {
  const cfg = resolveWorkspaceConfig(input);
  const need = typeof input === 'string' ? input : input.need;

  const availableApps = new Set(cfg.apps.map((a) => a.id));
  const availableServices = new Set(cfg.services.map((s) => s.id));
  const claims = cfg.program?.requiredClaims ?? [];

  const emitted = phasesFor(cfg, availableApps);

  // Resolve the segment's standards corpus once (empty if no segment).
  const segmentStandards = cfg.program?.segment
    ? standardsForSegment(cfg.program.segment as ClientSegmentId)
    : [];

  const milestones: ProjectMilestone[] = [];
  let ordinal = 0;

  for (const phase of PHASE_ORDER) {
    if (!emitted.has(phase)) continue;

    const apps = [...availableApps]
      .filter((id) => APP_PHASES[id].includes(phase))
      .map((id) => ({ id, label: getApp(id).label }));

    const services = [...availableServices].filter((id) =>
      (SERVICE_PHASES[id] ?? []).includes(phase),
    );

    const phaseClaims = claims.filter((c) => CLAIM_PHASES[c.id] === phase);
    const objectives = phaseClaims.map((c) => ({ id: c.id, label: c.label }));

    const deliverables = dedupe([
      ...phaseClaims.flatMap((c) => c.projectsTo),
      ...(FRAMING_DELIVERABLES[phase] ?? []),
    ]);

    // Surface the segment's recommended pre-submission meeting in strategy.
    if (phase === 'strategy' && cfg.program?.segment) {
      const meetings = meetingsForSegment(cfg.program.segment as ClientSegmentId);
      if (meetings.length) deliverables.push(`Agency meeting (${meetings[0]})`);
    }

    // Standards in force at this phase (segment corpus filtered by domain→phase).
    const standards: MilestoneStandard[] = segmentStandards
      .filter((s) => DOMAIN_PHASES[s.domain].includes(phase))
      .map((s) => ({
        id: s.id,
        designation: s.designation,
        body: s.body,
        currentVersion: s.currentVersion,
        domain: s.domain,
      }));

    milestones.push({
      id: phase,
      phase,
      ordinal: ordinal++,
      title: PHASE_META[phase].title,
      purpose: PHASE_META[phase].purpose,
      apps,
      services,
      objectives,
      deliverables,
      standards,
      gateway: phase === 'submission' ? cfg.gateway : null,
    });
  }

  return {
    need,
    known: cfg.known,
    scope: cfg.scope,
    segment: cfg.program?.segment ?? null,
    evidenceModel: cfg.program?.evidenceModel ?? null,
    milestones,
    inventory: buildInventory(cfg, emitted),
  };
}

/** Build the "what's needed, and when" inventory from the emitted phases. */
function buildInventory(cfg: WorkspaceConfig, emitted: Set<ProjectPhase>): CapabilityInventory {
  const apps: InventoryItem<WorkspaceAppId>[] = cfg.apps
    .map((a) => {
      const phases = APP_PHASES[a.id].filter((p) => emitted.has(p));
      const ordered = PHASE_ORDER.filter((p) => phases.includes(p));
      return ordered.length
        ? { id: a.id, label: getApp(a.id).label, neededAtPhases: ordered, firstNeededPhase: ordered[0] }
        : null;
    })
    .filter((x): x is InventoryItem<WorkspaceAppId> => x !== null);

  const services: InventoryItem<WorkspaceServiceId>[] = cfg.services
    .map((s) => {
      const phases = (SERVICE_PHASES[s.id] ?? []).filter((p) => emitted.has(p));
      const ordered = PHASE_ORDER.filter((p) => phases.includes(p));
      return ordered.length
        ? { id: s.id, label: s.label, neededAtPhases: ordered, firstNeededPhase: ordered[0] }
        : null;
    })
    .filter((x): x is InventoryItem<WorkspaceServiceId> => x !== null);

  return { apps, services };
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export default { resolveProjectMap, PHASE_ORDER };
