/**
 * Use-case playbooks — the tour-guide layer.
 *
 * The industry-wisdom pack tells AnA what experience teaches. This module
 * tells her how to ORIENT a user inside the product: given who they are and
 * what they are trying to do, where are they, what matters now, and what do
 * people in their situation do next.
 *
 * Two structures:
 *   - USE_CASES: the canonical journeys across all three segments. Each names
 *     who it is for, the trigger that puts a user in it, the product surfaces
 *     that serve it, the first moves, the one pitfall to watch, and the slash
 *     commands that help.
 *   - buildTourGuideBlock / buildOrientation: emit a "where you are / what
 *     matters now / common next moves" orientation for the system prompt when
 *     a user is new, lost, or explicitly asks to be guided.
 *
 * Read by:
 *   - context-enrichment.ts (/guide command + wayfinding triggers; also folded
 *     into the proactive greeting so AnA can lead with orientation)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/use-case-playbooks
 */

import type { ClientSegment, LifecycleStage } from './industry-wisdom-pack.js';
import {
  SEGMENT_LABELS,
  inferSegmentFromSubmissionType,
  inferSegmentFromMessage,
  inferStageFromMessage,
} from './industry-wisdom-pack.js';

// ─── Use-case shape ──────────────────────────────────────────────────────────

export interface UseCase {
  id: string;
  segment: ClientSegment;
  /** The journey, in plain language. */
  name: string;
  /** Roles this journey is usually owned by. */
  forRoles: string[];
  /** The lifecycle stage this journey centers on. */
  stage: LifecycleStage;
  /** What tells you a user is in this situation. */
  trigger: string;
  /** Product surfaces that serve this journey. */
  surfaces: string[];
  /** The first moves a competent operator makes. */
  firstMoves: string[];
  /** The single pitfall most likely to derail this journey. */
  watchOut: string;
  /** Slash commands that accelerate this journey. */
  commands: string[];
}

// ─── Medical device / IVD journeys ───────────────────────────────────────────

const MDX_USE_CASES: UseCase[] = [
  {
    id: 'mdx-510k',
    segment: 'mdx',
    name: 'Bring a Class II device to the US market via 510(k)',
    forRoles: ['ra_lead', 'general'],
    stage: 'strategy',
    trigger: 'You have a moderate-risk device with a plausible predicate and want US clearance.',
    surfaces: ['predicate', 'k510', 'estar-editor', 'pre-sub'],
    firstMoves: [
      'Settle the primary predicate before anything else — run a predicate search and a toxicity check.',
      'Build the substantial-equivalence matrix and resolve every technology-difference row.',
      'Decide whether a Pre-Sub is warranted for any novel test method.',
    ],
    watchOut: 'Anchoring on a closer technological match that carries an RTF or split-predicate history.',
    commands: ['precedent', 'device', 'readiness', 'preflight'],
  },
  {
    id: 'mdx-denovo',
    segment: 'mdx',
    name: 'Classify a novel device with no predicate (De Novo)',
    forRoles: ['ra_lead', 'general'],
    stage: 'strategy',
    trigger: 'Your device is low-to-moderate risk but there is no legally marketed predicate to claim equivalence to.',
    surfaces: ['k510', 'pre-sub'],
    firstMoves: [
      'Confirm De Novo is the right route — not a forced 510(k) against a distant predicate.',
      'Define the special controls you are proposing, since a De Novo creates a new classification.',
      'Use a Pre-Sub to align with FDA on the risk profile and the special controls.',
    ],
    watchOut: 'Treating De Novo as a slower 510(k); it requires you to author the classification and controls, not just claim equivalence.',
    commands: ['device', 'precedent', 'strategy'],
  },
  {
    id: 'mdx-pma',
    segment: 'mdx',
    name: 'Bring a high-risk device to market via PMA',
    forRoles: ['ra_lead', 'clinical_lead'],
    stage: 'clinical',
    trigger: 'Your device is Class III or life-sustaining; substantial equivalence is not available.',
    surfaces: ['k510', 'pre-sub', 'cer'],
    firstMoves: [
      'Plan the pivotal clinical study and its endpoints as the spine of the PMA.',
      'Use the Pre-Sub program to agree the study design and acceptance criteria.',
      'Map the manufacturing and quality-system requirements early — PMA includes a facility inspection.',
    ],
    watchOut: 'Under-scoping the clinical evidence; a PMA is an approval standard, not a clearance.',
    commands: ['strategy', 'readiness', 'device'],
  },
  {
    id: 'mdx-ce-mdr',
    segment: 'mdx',
    name: 'CE-mark a device in the EU under MDR',
    forRoles: ['ra_lead', 'medical_writer'],
    stage: 'strategy',
    trigger: 'You are taking a device to the EU/EEA and need a Clinical Evaluation Report and GSPR coverage.',
    surfaces: ['cer'],
    firstMoves: [
      'Plan the clinical evidence and PMCF as a distinct workstream — do not reuse the US SE story.',
      'Build the GSPR mapping with a justification for every applicable requirement.',
      'Engage a Notified Body early; their capacity is a real timeline constraint.',
    ],
    watchOut: 'Assuming literature plus equivalence will clear a Class IIb/III device under MDR.',
    commands: ['device', 'safety', 'readiness'],
  },
  {
    id: 'mdx-cdx-ivd',
    segment: 'mdx',
    name: 'Validate a companion diagnostic or IVD',
    forRoles: ['ra_lead', 'clinical_lead'],
    stage: 'clinical',
    trigger: 'You have an assay whose claims depend on analytical and clinical performance.',
    surfaces: ['k510', 'pre-sub'],
    firstMoves: [
      'Pin the intended use and claim boundaries before designing validation.',
      'Plan analytical validation (precision, accuracy, LoD, linearity) and clinical performance (sensitivity, specificity, PPV, NPV) together.',
      'For a CDx, coordinate the assay timeline with the therapeutic it gates.',
    ],
    watchOut: 'Letting performance claims drift ahead of the validation data that supports them.',
    commands: ['diagnostics', 'device', 'claims'],
  },
  {
    id: 'mdx-ai-letter',
    segment: 'mdx',
    name: 'Respond to an FDA Additional Information letter',
    forRoles: ['ra_lead', 'medical_writer'],
    stage: 'agency_interaction',
    trigger: 'FDA sent deficiencies on a filed 510(k) and the review clock is on hold.',
    surfaces: ['pre-sub', 'estar-editor'],
    firstMoves: [
      'Ingest the letter and classify each issue; assign an owner per issue.',
      'Respond to issues in the order FDA raised them, with verbatim section references.',
      'Validate the full response package before transmit.',
    ],
    watchOut: 'Responding out of sequence or orphaning the response from the original letter in the audit trail.',
    commands: ['haq', 'review', 'preflight'],
  },
  {
    id: 'mdx-pms',
    segment: 'mdx',
    name: 'Run post-market surveillance for a CE-marked device',
    forRoles: ['ra_lead', 'clinical_lead'],
    stage: 'lifecycle',
    trigger: 'Your device is on the EU market and you owe PMS, PMCF, and PSUR obligations under MDR.',
    surfaces: ['cer'],
    firstMoves: [
      'Stand up the PMS plan with defined data sources, analysis, and trend reporting.',
      'Run the PMCF activities and feed the results back into the CER and risk file.',
      'Keep the PSUR current for Class IIa and above.',
    ],
    watchOut: 'Treating PMS as an archive; Notified Body audits check that it actually updates the clinical evaluation.',
    commands: ['safety', 'signals', 'device'],
  },
];

// ─── Biotech journeys ────────────────────────────────────────────────────────

const BIOTECH_USE_CASES: UseCase[] = [
  {
    id: 'bio-first-ind',
    segment: 'biotech',
    name: 'File a first IND for a biologic',
    forRoles: ['ra_lead', 'cmc_lead', 'ceo'],
    stage: 'pre_submission',
    trigger: 'You are moving a biologic into first-in-human and need an IND cleared.',
    surfaces: [],
    firstMoves: [
      'Hold a pre-IND meeting on the nonclinical package and the proposed first-in-human design.',
      'Start the CMC comparability and stability programs now, not at Phase 3.',
      'Assemble Module 2 summaries that make the safety argument the reviewer needs.',
    ],
    watchOut: 'Under-resourcing CMC while clinical accelerates — Module 3 becomes the silent critical path.',
    commands: ['strategy', 'readiness', 'cmc'],
  },
  {
    id: 'bio-cgt-ind',
    segment: 'biotech',
    name: 'File a gene or cell therapy IND with CBER',
    forRoles: ['ra_lead', 'cmc_lead', 'clinical_lead'],
    stage: 'pre_submission',
    trigger: 'You have an advanced-therapy product entering the clinic under CBER.',
    surfaces: [],
    firstMoves: [
      'Lock a potency-assay strategy and a biodistribution plan early.',
      'Plan the long-term follow-up the modality requires (up to 15 years for integrating vectors).',
      'Use the INTERACT / pre-IND route to align with CBER on CMC and the FIH design.',
    ],
    watchOut: 'Deferring the potency assay — an immature assay draws a clinical hold and expensive late re-bridging.',
    commands: ['cmc', 'strategy', 'safety'],
  },
  {
    id: 'bio-bla',
    segment: 'biotech',
    name: 'Assemble and file a BLA',
    forRoles: ['ra_lead', 'medical_writer', 'cmc_lead'],
    stage: 'submission',
    trigger: 'Your pivotal has read out and you are compiling the biologics license application.',
    surfaces: [],
    firstMoves: [
      'Reconcile the load-bearing numbers across protocol, SAP, CSR, and the Module 2 summaries.',
      'Confirm the commercial process is locked or the comparability bridge is in hand.',
      'Run a readiness diagnostic and close critical gaps before transmit.',
    ],
    watchOut: 'A late process or supplier change forcing a comparability exercise the timeline has no room for.',
    commands: ['readiness', 'ectd', 'cmc', 'claims'],
  },
  {
    id: 'bio-biosimilar',
    segment: 'biotech',
    name: 'Develop a biosimilar via the 351(k) pathway',
    forRoles: ['ra_lead', 'cmc_lead'],
    stage: 'strategy',
    trigger: 'You are developing a biosimilar to a licensed reference product.',
    surfaces: [],
    firstMoves: [
      'Build the analytical similarity assessment as the foundation of the totality-of-evidence argument.',
      'Plan the comparative clinical and immunogenicity studies the residual uncertainty requires.',
      'Use a biosimilar Development meeting to align on the data package.',
    ],
    watchOut: 'Treating clinical data as the centerpiece; for a biosimilar the analytical similarity carries the argument.',
    commands: ['cmc', 'precedent', 'strategy'],
  },
  {
    id: 'bio-orphan-pediatric',
    segment: 'biotech',
    name: 'Sequence orphan designation with pediatric obligations',
    forRoles: ['ra_lead', 'ceo'],
    stage: 'strategy',
    trigger: 'You are pursuing an orphan indication and need to plan around pediatric requirements.',
    surfaces: [],
    firstMoves: [
      'Map orphan designation, the iPSP/PIP timeline, and the adult filing as one sequence.',
      'File pediatric plans at end of Phase 2.',
      'Confirm where orphan status changes — but does not remove — the EU pediatric calculus.',
    ],
    watchOut: 'A missing or late iPSP/PIP delaying or blocking the adult NDA/MAA.',
    commands: ['strategy', 'precedent'],
  },
  {
    id: 'bio-breakthrough',
    segment: 'biotech',
    name: 'Pursue Breakthrough or RMAT designation',
    forRoles: ['ra_lead', 'ceo', 'investor'],
    stage: 'strategy',
    trigger: 'You have early data suggesting substantial improvement over available therapy.',
    surfaces: [],
    firstMoves: [
      'Assemble the preliminary clinical evidence that meets the designation criteria.',
      'Plan to use the designation for rolling review and more frequent FDA contact.',
      'Keep building the evidence package as if the designation were not there.',
    ],
    watchOut: 'Treating the designation as a discount on the evidence bar; it speeds interaction, not the standard.',
    commands: ['strategy', 'precedent', 'risk'],
  },
  {
    id: 'bio-pre-bla-meeting',
    segment: 'biotech',
    name: 'Prepare a pre-BLA meeting',
    forRoles: ['ra_lead', 'medical_writer'],
    stage: 'pre_submission',
    trigger: 'Your pivotal is reading out and you want to confirm the BLA will be accepted as planned.',
    surfaces: [],
    firstMoves: [
      'Frame the meeting to lock the application contents, primary analyses, and integrated-summary scope.',
      'Surface any waivers, comparability bridges, or format questions before they become filing surprises.',
      'Bring your own draft minutes and confirm agreements in writing afterward.',
    ],
    watchOut: 'Using the meeting for abstract strategy instead of confirming exactly what the reviewer expects to see.',
    commands: ['readiness', 'strategy', 'brief'],
  },
  {
    id: 'bio-crl-response',
    segment: 'biotech',
    name: 'Respond to a complete response letter',
    forRoles: ['ra_lead', 'ceo'],
    stage: 'agency_interaction',
    trigger: 'FDA issued a CRL on your BLA and you need a path back to approval.',
    surfaces: [],
    firstMoves: [
      'Request a Type A meeting to confirm the path before committing to a resubmission scope.',
      'Address every cited deficiency, not just the easy ones.',
      'Match the resubmission class to the work actually required.',
    ],
    watchOut: 'Relitigating the agency\'s judgment or resubmitting piecemeal, which restarts the clock without resolving the file.',
    commands: ['haq', 'risk', 'strategy'],
  },
];

// ─── Pharma journeys ─────────────────────────────────────────────────────────

const PHARMA_USE_CASES: UseCase[] = [
  {
    id: 'pharma-first-ind',
    segment: 'pharma',
    name: 'File a first IND for a small molecule',
    forRoles: ['ra_lead', 'clinical_lead'],
    stage: 'pre_submission',
    trigger: 'You are taking a small molecule into first-in-human.',
    surfaces: [],
    firstMoves: [
      'Map the nonclinical critical path against the eventual NDA date, including the long-duration studies.',
      'Hold a pre-IND meeting on the tox package and the FIH design.',
      'Confirm the CMC is adequate for the proposed clinical duration.',
    ],
    watchOut: 'Pacing nonclinical to the clinic and discovering the carcinogenicity package will not be ready for the NDA.',
    commands: ['strategy', 'readiness'],
  },
  {
    id: 'pharma-nda',
    segment: 'pharma',
    name: 'Assemble and file an NDA',
    forRoles: ['ra_lead', 'medical_writer'],
    stage: 'submission',
    trigger: 'Your pivotal program has read out and you are compiling the NDA.',
    surfaces: [],
    firstMoves: [
      'Confirm the nonclinical long-pole studies are complete and reported.',
      'Reconcile numbers across protocol, SAP, CSR, and the Module 2 summaries.',
      'Run a readiness diagnostic; check QT and DDI characterization is in the label-ready state.',
    ],
    watchOut: 'A late QT or DDI signal landing directly in the label or forcing additional studies.',
    commands: ['readiness', 'ectd', 'claims', 'risk'],
  },
  {
    id: 'pharma-505b2',
    segment: 'pharma',
    name: 'Use the 505(b)(2) pathway',
    forRoles: ['ra_lead'],
    stage: 'strategy',
    trigger: 'You can rely in part on data you did not generate (literature or a listed drug).',
    surfaces: [],
    firstMoves: [
      'Define exactly which data you are relying on and which bridging data you owe.',
      'Plan the bridging studies (often PK) that connect your product to the relied-upon data.',
      'Confirm patent and exclusivity implications of the reference.',
    ],
    watchOut: 'Underestimating the bridging data needed to justify reliance on another product.',
    commands: ['strategy', 'precedent'],
  },
  {
    id: 'pharma-anda',
    segment: 'pharma',
    name: 'File an ANDA (generic)',
    forRoles: ['ra_lead', 'cmc_lead'],
    stage: 'submission',
    trigger: 'You are filing a generic referencing an approved listed drug.',
    surfaces: [],
    firstMoves: [
      'Establish bioequivalence to the reference listed drug per the product-specific guidance.',
      'Build the CMC package to the same quality standard as the innovator.',
      'Handle the patent certification (Paragraph IV where applicable) deliberately.',
    ],
    watchOut: 'Treating bioequivalence as a formality; the BE study design is product-specific and often the gating item.',
    commands: ['cmc', 'precedent'],
  },
  {
    id: 'pharma-lifecycle-variation',
    segment: 'pharma',
    name: 'File a post-approval CMC change',
    forRoles: ['ra_lead', 'cmc_lead'],
    stage: 'lifecycle',
    trigger: 'You need to change a manufacturing process, site, or specification after approval.',
    surfaces: [],
    firstMoves: [
      'Classify the change deliberately — established conditions, CBE-30, or prior-approval supplement.',
      'Assemble the comparability data the change category requires.',
      'Align FDA and EU classifications so a single change is not filed three different ways by accident.',
    ],
    watchOut: 'Defaulting to the most conservative category (delay) or under-filing a change that needed prior approval (finding).',
    commands: ['cmc', 'strategy'],
  },
  {
    id: 'pharma-pv-psur',
    segment: 'pharma',
    name: 'Run the periodic safety reporting cycle',
    forRoles: ['ra_lead'],
    stage: 'lifecycle',
    trigger: 'You have an approved product with ongoing pharmacovigilance obligations.',
    surfaces: [],
    firstMoves: [
      'Anchor the PBRER cycle to the international birth date and the EURD list.',
      'Set the data-lock point and the cross-functional authoring timeline against the submission date.',
      'Track signals continuously rather than reconstructing them at report time.',
    ],
    watchOut: 'Tracking the cycle against an internal calendar and missing a harmonized EU reference date.',
    commands: ['safety', 'signals'],
  },
  {
    id: 'pharma-asia-expansion',
    segment: 'pharma',
    name: 'Expand into Japan or China',
    forRoles: ['ra_lead', 'ceo'],
    stage: 'strategy',
    trigger: 'You have a global dataset and want PMDA or NMPA approval.',
    surfaces: [],
    firstMoves: [
      'Assess regional representation in your existing data against PMDA and NMPA expectations.',
      'Decide between a multi-regional trial under ICH E17 and a dedicated bridging study.',
      'Build the local-data and translation timeline into the Asia plan from the start.',
    ],
    watchOut: 'Assuming global data transfers automatically; both agencies expect adequate local or bridging data.',
    commands: ['strategy', 'precedent'],
  },
  {
    id: 'pharma-pre-nda-meeting',
    segment: 'pharma',
    name: 'Prepare a pre-NDA meeting',
    forRoles: ['ra_lead', 'medical_writer'],
    stage: 'pre_submission',
    trigger: 'Your pivotal program is reading out and you want to confirm the NDA will be accepted as planned.',
    surfaces: [],
    firstMoves: [
      'Lock the application contents, the primary analyses, and the integrated-summary scope.',
      'Confirm any waivers and the acceptability of the nonclinical and CMC packages.',
      'Capture agreements in writing and reconcile the agency minutes.',
    ],
    watchOut: 'Discussing strategy in the abstract instead of confirming exactly what the reviewer expects, risking a refuse-to-file.',
    commands: ['readiness', 'strategy', 'brief'],
  },
  {
    id: 'pharma-crl-response',
    segment: 'pharma',
    name: 'Respond to a complete response letter',
    forRoles: ['ra_lead', 'ceo'],
    stage: 'agency_interaction',
    trigger: 'FDA issued a CRL on your NDA and you need a path back to approval.',
    surfaces: [],
    firstMoves: [
      'Request a Type A meeting to confirm the resubmission path.',
      'Address every deficiency in the letter and align the resubmission class to the work required.',
      'Where the deficiency is about labeling, prepare the labeling argument with full evidence.',
    ],
    watchOut: 'Going quiet or relitigating the science the agency already weighed, instead of resolving each cited deficiency.',
    commands: ['haq', 'risk', 'strategy'],
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const USE_CASES: UseCase[] = [
  ...MDX_USE_CASES,
  ...BIOTECH_USE_CASES,
  ...PHARMA_USE_CASES,
];

export function listUseCasesForSegment(segment: ClientSegment): UseCase[] {
  return USE_CASES.filter((u) => u.segment === segment);
}

export function getUseCase(id: string): UseCase | null {
  return USE_CASES.find((u) => u.id === id) ?? null;
}

// ─── Orientation primitive ───────────────────────────────────────────────────

/** Plain-language "what matters now" per lifecycle stage, segment-agnostic. */
const STAGE_FOCUS: Record<LifecycleStage, string> = {
  strategy:
    'Pick one credible pathway and name the next two de-risking milestones with dates. Optionality is not a plan.',
  nonclinical_cmc:
    'Protect the long-pole studies. Manufacturing, comparability, and tox timelines do not compress — they gate the filing.',
  clinical:
    'Defend the endpoints and the design. A liability found late (QT, DDI, immunogenicity, a weak surrogate) becomes a labeling or approval problem.',
  pre_submission:
    'Buy down risk before you file. A meeting on a genuine uncertainty is cheaper than the deficiency it prevents.',
  submission:
    'Make the summaries carry the argument and reconcile every load-bearing number across the dossier before transmit.',
  agency_interaction:
    'Answer in the order the agency asked, ground every response in evidence, and close every commitment before the next transmit.',
  lifecycle:
    'Right-size each change and treat periodic safety cadence as a hard obligation driven by the birth date, not your calendar.',
};

/**
 * Build a "where you are / what matters now / common next moves" orientation
 * for the system prompt. Used when a user is new, lost, or asks to be guided.
 */
export function buildOrientation(opts: {
  segment?: ClientSegment | null;
  stage?: LifecycleStage | null;
}): string {
  const { segment, stage } = opts;
  const parts: string[] = ['\n\n## Orientation — be the tour guide'];

  parts.push(
    'The user may not know where to start or what matters most. Orient them like a guide who has walked this route many times: name where they are, name what matters now, and offer the two or three moves people in their situation usually make next. Keep it short and specific to their segment and stage — do not dump the whole map.',
  );

  if (stage) {
    parts.push(`\n**What matters at this stage (${stage.replace(/_/g, ' ')}):** ${STAGE_FOCUS[stage]}`);
  }

  if (segment) {
    const cases = listUseCasesForSegment(segment).filter((u) => !stage || u.stage === stage);
    const shown = (cases.length > 0 ? cases : listUseCasesForSegment(segment)).slice(0, 4);
    if (shown.length > 0) {
      parts.push(`\n**Common journeys for ${SEGMENT_LABELS[segment]}:**`);
      for (const u of shown) {
        parts.push(
          `- **${u.name}** — ${u.trigger} First moves: ${u.firstMoves[0]} Watch out for: ${u.watchOut}`,
        );
      }
    }
  } else {
    parts.push(
      '\nSegment is not yet clear. Ask one question to place them — device/IVD, biologic/cell-gene, or small-molecule — then orient to that segment rather than guessing.',
    );
  }

  parts.push(
    '\nClose with a single concrete next move tied to where they are, framed as an offer (for example, "Want me to run a readiness check, or start with the predicate?").',
  );

  return parts.join('\n');
}

/**
 * Full tour-guide block: orientation plus the segment's journey map. Returns ''
 * only if nothing can be inferred and no segment is supplied (the orientation
 * itself still renders a useful "ask one question" prompt, so this rarely
 * returns empty).
 */
export function buildTourGuideBlock(opts: {
  segment?: ClientSegment | null;
  stage?: LifecycleStage | null;
  submissionType?: string;
  message?: string;
} = {}): string {
  const segment =
    opts.segment ??
    inferSegmentFromSubmissionType(opts.submissionType) ??
    (opts.message ? inferSegmentFromMessage(opts.message) : null);
  const stage = opts.stage ?? (opts.message ? inferStageFromMessage(opts.message) : null);
  return buildOrientation({ segment, stage });
}
