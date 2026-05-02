/**
 * MDX knowledge pack — structured material AnA pulls from when she
 * explains the MDX module, onboards a new tenant, or grounds an answer.
 *
 * The pack has four sections:
 *
 *   - SURFACES: every MDX UI surface (Overview, K510Surface, etc.). What
 *     it's for, when to use it, key affordances, common questions, the
 *     tools that act on its data.
 *   - WORKFLOWS: the 5 BETA workflows (W1-W5) plus reviewer-simulation
 *     and AI-letter response. Trigger → ordered steps → success criteria
 *     → common pitfalls.
 *   - REGULATIONS: terse entries for the regulatory concepts MDX touches
 *     (510(k), Q-Sub, eSTAR, Substantial Equivalence, Part 11, GSPR,
 *     PMS/PMCF). Definition + FDA citation + when-it-applies +
 *     what-it-requires.
 *   - TOOLS: exposes the MDX_COMMAND_METADATA from the three phases
 *     under one taxonomy so the pack is always consistent with what
 *     AnA can actually do.
 *
 * Read by:
 *   - mdx-onboarding-curriculum.ts (looks up surfaces + workflows for
 *     each step's "what AnA says" copy)
 *   - mdx-context-resolver.ts (annotates the active surface)
 *   - chat-context-builder.ts (injects into AnA's system prompt when
 *     workstream='mdx')
 *
 * NOT a prompt template. The pack is structured data; the prompt
 * builder picks fields and emits Markdown.
 */

import { MDX_COMMAND_METADATA } from './mdx-command-handlers';
import { MDX_COMMAND_METADATA_PHASE2 } from './mdx-command-handlers-phase2';
import { MDX_COMMAND_METADATA_PHASE3 } from './mdx-command-handlers-phase3';

// ─── Surfaces ──────────────────────────────────────────────────────────────

export interface MdxSurface {
  /** Canonical key matching App.tsx switch cases. */
  key: string;
  /** Short label shown in TopBar. */
  label: string;
  /** One-paragraph plain-language purpose. AnA reads this when explaining. */
  purpose: string;
  /** When the user should be on this surface. */
  whenToUse: string;
  /** Top affordances on the surface (buttons / panels). */
  affordances: string[];
  /** Common questions a user asks while here. */
  commonQuestions: string[];
  /** AnA tool names that act on this surface's data. */
  relevantTools: string[];
  /** Status for the BETA plan: 'live' (fully wired), 'fixture' (UI on demo data), 'stub' (in design). */
  status: 'live' | 'fixture' | 'stub';
}

export const MDX_SURFACES: MdxSurface[] = [
  {
    key: 'overview',
    label: 'Overview',
    purpose:
      'Portfolio view of every regulatory program in your organization. ' +
      'Shows pathway, stage, evidence-sufficiency score, and approaching deadlines.',
    whenToUse:
      'Start here when you log in. Use it to triage which program needs your attention next.',
    affordances: [
      'Click a program to open Project Home',
      'Filter by pathway (510(k), PMA, CER)',
      'Sort by deadline urgency',
    ],
    commonQuestions: [
      'Which of my programs is closest to its target date?',
      'Which programs have open blockers?',
      'What changed since I was last here?',
    ],
    relevantTools: [],
    status: 'fixture',
  },
  {
    key: 'project-home',
    label: 'Project home',
    purpose:
      'Single-program command center. Shows device profile, evidence-sufficiency ' +
      'breakdown, predicate set, eSTAR section progress, recent activity.',
    whenToUse:
      'Open this when you want to understand the state of one program before diving into a workflow.',
    affordances: ['Open the K510Surface', 'Open the Pre-Sub Manager', 'Open the eSTAR editor'],
    commonQuestions: [
      'How close am I to filing this 510(k)?',
      'What does my evidence package look like?',
      'Which sections still need work?',
    ],
    relevantTools: ['evidence_sufficiency.assess'],
    status: 'fixture',
  },
  {
    key: 'k510',
    label: '510(k) workspace',
    purpose:
      'The 510(k)-specific working surface. Pulls live predicate-intelligence + SE-matrix + ' +
      'evidence-sufficiency + authoring readiness for the active program.',
    whenToUse:
      'Use this any time you are working on a 510(k) submission specifically — predicate selection, ' +
      'SE matrix work, eSTAR readiness checks.',
    affordances: [
      'Predicate panel with primary + reference candidates',
      'SE matrix with per-row resolution status',
      'eSTAR section readiness strip',
      'Pre-flight launcher',
    ],
    commonQuestions: [
      'Which predicate should I pick as primary?',
      'Where am I on the SE matrix?',
      'Am I ready to pre-flight?',
    ],
    relevantTools: [
      'predicate.candidate.set_status',
      'se_matrix.patch',
      'k510_workflow.preflight',
      'evidence_sufficiency.assess',
    ],
    status: 'fixture',
  },
  {
    key: 'pre-sub',
    label: 'Pre-Sub manager',
    purpose:
      'Manages the conversation with FDA before filing — Pre-Subs, SIRs, SRDs, Agreement, Informational. ' +
      'Tracks each Q-Sub through stages plan → package → submit → await → feedback → integrate, ' +
      'plus the commitments captured from FDA feedback.',
    whenToUse:
      'Open this whenever you have an in-flight FDA conversation or want to file a new one.',
    affordances: [
      'List of every Q-Sub with stage + days-in',
      'Per-Q-Sub detail with questions, FDA responses, commitments',
      'Mark commitment as rolled-in (when you have updated the dossier)',
      'File a new Q-Sub',
    ],
    commonQuestions: [
      'What did FDA say in our last Pre-Sub?',
      'Which commitments are still open?',
      'How do I file a new Pre-Sub?',
    ],
    relevantTools: ['q_sub.create', 'q_sub.commitment.set_rolled_in'],
    status: 'live',
  },
  {
    key: 'estar-editor',
    label: 'eSTAR editor',
    purpose:
      'Authoring surface for 510(k) eSTAR sections. Edit, validate, and approve sections ' +
      'with a Part-11-compliant audit trail.',
    whenToUse:
      'When you are writing or reviewing eSTAR sections (typically §3, §4, §6, §11, §12 are the load-bearing ones).',
    affordances: [
      'Side-by-side editor with section content',
      'Validation findings inline',
      'Section approval / sign-off',
      'Version history with hash chain',
    ],
    commonQuestions: [
      'What does this validation finding mean?',
      'How do I approve this section?',
      'What changed in the last revision?',
    ],
    relevantTools: ['section.approve'],
    status: 'fixture',
  },
  {
    key: 'cer',
    label: 'CER workbench',
    purpose:
      'Clinical Evaluation Report authoring (EU MDR). Shows literature pulls, post-market data, ' +
      'and the CER section tree.',
    whenToUse: 'When you are working on the EU side of a device that has CE marking obligations.',
    affordances: ['Section tree', 'Literature pulls', 'Post-market data tab'],
    commonQuestions: ['Where do I attach this PMCF data?', 'Is my CER ready for review?'],
    relevantTools: ['gspr.mapping.upsert', 'post_market.document.create'],
    status: 'fixture',
  },
  {
    key: 'predicate',
    label: 'Predicate intelligence',
    purpose:
      'Searches the FDA 510(k) catalog for predicate candidates ranked by similarity, ' +
      'flags toxic predicates (RTF/CRL trigger history), and emits SE-matrix scaffolding.',
    whenToUse: 'Early in a 510(k) program when you are picking your primary + reference predicates.',
    affordances: [
      'Candidate list with similarity score',
      'Toxic predicate detail (RTF/CRL signals)',
      'Generate SE matrix from selection',
    ],
    commonQuestions: [
      'Which predicate is most defensible?',
      'Why is K191822 flagged as toxic?',
      'What technology differences need a justification?',
    ],
    relevantTools: ['predicate.candidate.set_status', 'se_matrix.patch'],
    status: 'fixture',
  },
];

// ─── Workflows ─────────────────────────────────────────────────────────────

export interface MdxWorkflow {
  id: string;
  label: string;
  /** Plain-language objective in one sentence. */
  objective: string;
  /** Trigger: what tells the user it's time to run this workflow. */
  trigger: string;
  /** Ordered steps. */
  steps: string[];
  /** Concrete success criteria. */
  successCriteria: string[];
  /** Common pitfalls AnA should warn about. */
  pitfalls: string[];
  /** Surfaces involved. */
  surfaces: string[];
  /** Tools AnA can invoke during this workflow. */
  tools: string[];
}

export const MDX_WORKFLOWS: MdxWorkflow[] = [
  {
    id: 'W1',
    label: 'Read program state',
    objective:
      'Get a complete picture of where a 510(k) program stands: predicates, SE matrix, ' +
      'evidence sufficiency, eSTAR readiness.',
    trigger: 'You opened the 510(k) workspace for a program you have not looked at recently.',
    steps: [
      'Open the K510 surface for the program.',
      'Review predicate panel — primary picked? reference predicates listed?',
      'Walk the SE matrix — every row resolved?',
      'Check evidence-sufficiency score — is it above the verdict threshold?',
      'Check eSTAR section readiness strip — any sections at risk?',
    ],
    successCriteria: [
      'You can name your primary predicate.',
      'No SE matrix rows are unresolved.',
      'Evidence-sufficiency verdict is sufficient or borderline (not insufficient).',
      'No eSTAR section is in "todo" within 30 days of target_submission_date.',
    ],
    pitfalls: [
      'Stale evidence-sufficiency scores — re-run if anything material changed in the dossier.',
      'Ignoring "considering" predicates — they should be moved to primary or rejected.',
    ],
    surfaces: ['k510'],
    tools: ['evidence_sufficiency.assess', 'predicate.candidate.set_status', 'se_matrix.patch'],
  },
  {
    id: 'W2',
    label: 'Author eSTAR + validate',
    objective: 'Edit a 510(k) eSTAR section, run validation, fix findings, approve with Part-11 sign-off.',
    trigger: 'You are responsible for a section that is in "todo" or "drafting" status.',
    steps: [
      'Open the eSTAR editor for the program.',
      'Pick the section (typically §3 IFU, §6 SE, §11 Performance, §12 Labeling).',
      'Edit the body. Save.',
      'Run validation. Address findings.',
      'Once findings are clean, approve via the governed-action sign-off button.',
    ],
    successCriteria: [
      'Section status is "validated" or "approved".',
      'Validation findings list is empty.',
      'audit_logs has one section.edit row + one section.approve row.',
    ],
    pitfalls: [
      'Approving without addressing critical-severity findings — the audit-trail will show the gap.',
      'Editing a section that is already approved without re-validating — the section flips back to "drafting".',
    ],
    surfaces: ['estar-editor'],
    tools: ['section.approve'],
  },
  {
    id: 'W3',
    label: 'Pre-Sub cycle',
    objective:
      'File a Pre-Sub, receive FDA feedback, capture commitments, roll commitments into the dossier.',
    trigger: 'You have a question for FDA that you want answered before you file your 510(k).',
    steps: [
      'Open the Pre-Sub Manager.',
      'Create a new Q-Sub (presub|sir|srd|agree|info) — define type, title, target date.',
      'Author the question list and our position for each.',
      'File the package via ESG (advances stage to "submit").',
      'When FDA responds, record their answer and capture commitments.',
      'For each commitment, when the dossier is updated, mark it rolled-in.',
    ],
    successCriteria: [
      'Q-Sub stage advances through plan → package → submit → await → feedback → integrate.',
      'Every commitment is either rolled-in OR explicitly deferred with a documented reason.',
      'No commitment is in "blocker=true, rolled_in=false" within 14 days of the next dossier transmit.',
    ],
    pitfalls: [
      'Filing a Pre-Sub without internal RA review — FDA will see the same rough draft you saw.',
      'Letting commitments stay open past the next transmit — they re-surface as 510(k) deficiencies.',
    ],
    surfaces: ['pre-sub'],
    tools: ['q_sub.create', 'q_sub.commitment.set_rolled_in'],
  },
  {
    id: 'W4',
    label: 'AI letter response',
    objective: 'Ingest an FDA AI letter, classify the deficiencies, route to owners, package the response.',
    trigger: 'FDA sent an Additional Information request on a filed 510(k).',
    steps: [
      'Ingest the AI letter via correspondence.intake (PDF or pasted text).',
      'Review the auto-extracted issues; assign each to an owner.',
      'For each issue, edit the linked eSTAR sections + capture the response narrative.',
      'Run validation across the response package.',
      'Compile the response cover letter (cover-letter composer pulls verbatim from §3/§6/§11/§12).',
      'Route through Part-11 sign-off; transmit via ESG.',
    ],
    successCriteria: [
      'Every issue in the AI letter is in status "responded" or "deferred-with-justification".',
      'Cover letter exists with verbatim section content.',
      'audit_logs has one correspondence.ingest + one correspondence.response.compile + one k510_workflow.transmit.',
    ],
    pitfalls: [
      'Responding to issues out of order — FDA reads in sequence; mismatched section refs cause confusion.',
      'Forgetting to link the response to the original AI letter — auditor reads the audit trail and sees an orphan transmit.',
    ],
    surfaces: ['pre-sub', 'estar-editor'],
    tools: ['correspondence.ingest', 'section.approve'],
  },
  {
    id: 'W5',
    label: 'Pre-flight + transmit',
    objective: 'Run the RTA pre-flight, address blockers, transmit the dossier to FDA ESG.',
    trigger: 'Every section is at "validated" or "approved" and the target date is within 30 days.',
    steps: [
      'Run k510_workflow.preflight on the dossier.',
      'Review the overall verdict + major-blockers list.',
      'Resolve every major blocker (the pre-flight refuses to advance until they are clear).',
      'Re-run pre-flight. Confirm overall verdict is "green".',
      'Compile the response package + cover letter + 510(k) summary.',
      'Route through Part-11 sign-off (RA + QA + Tech).',
      'Transmit via ESG.',
      'Capture the ESG receipt; the review clock starts.',
    ],
    successCriteria: [
      'Pre-flight verdict is green; majorBlockers is empty.',
      'audit_logs has one k510_workflow.transmit row with the FDA tracking handle in details.',
      'Submission package_id and transactionId persisted.',
    ],
    pitfalls: [
      'Transmitting without the cover letter / 510(k) summary — FDA will RTA you for incomplete submission.',
      'Confirming the transmit too quickly — the platform requires confirm="yes-transmit" + reason ≥ 30 chars; that delay is a feature.',
    ],
    surfaces: ['k510'],
    tools: ['k510_workflow.preflight', 'k510_workflow.transmit'],
  },
];

// ─── Regulations ───────────────────────────────────────────────────────────

export interface MdxRegulation {
  id: string;
  label: string;
  /** Short definition (≤ 2 sentences). */
  definition: string;
  /** Authoritative citation. */
  citation: string;
  /** When this concept applies. */
  appliesWhen: string;
  /** What it requires (bullet list). */
  requires: string[];
}

export const MDX_REGULATIONS: MdxRegulation[] = [
  {
    id: '510k',
    label: '510(k) premarket notification',
    definition:
      'A 510(k) is a premarket submission demonstrating that a device is "substantially equivalent" ' +
      '(SE) to a legally marketed predicate device.',
    citation: '21 CFR §807 Subpart E; FDA "Format for Traditional and Abbreviated 510(k)s" Sep 2019.',
    appliesWhen: 'You are bringing a Class II device to U.S. market by the 510(k) pathway.',
    requires: [
      'A primary predicate device (and reference predicates if applicable).',
      'Substantial Equivalence narrative comparing intended use, technology, performance.',
      'Performance testing data when SE cannot be shown by intended use + technology alone.',
      'eSTAR-formatted submission (mandatory since Oct 2023).',
    ],
  },
  {
    id: 'q-sub',
    label: 'Q-Submission program',
    definition:
      'The Q-Submission program is FDA CDRH\'s mechanism for sponsors to ask FDA questions before ' +
      '(or during) a marketing submission. Includes Pre-Subs, Submission Issue Requests (SIR), Study ' +
      'Risk Determinations (SRD), Agreement Meetings, and Informational Meetings.',
    citation: 'FDA "Requests for Feedback and Meetings for Medical Device Submissions: The Q-Submission Program", Sep 2023 rev.',
    appliesWhen:
      'Use a Pre-Sub when you have a substantive question about your submission strategy, predicate ' +
      'choice, performance testing, clinical study design, or regulatory pathway.',
    requires: [
      'A specific question list (3-5 questions is typical).',
      'A device description, intended use, technology summary.',
      'Sponsor\'s pre-meeting position on each question.',
      'A 75-day FDA target for written feedback or meeting.',
    ],
  },
  {
    id: 'estar',
    label: 'eSTAR (Electronic Submission Template And Resource)',
    definition:
      'eSTAR is FDA\'s required PDF template for 510(k) submissions. It enforces submission completeness ' +
      'via section-level fields the sponsor fills in.',
    citation: 'FDA "eSTAR Program: A Voluntary Pilot for Electronic Submission Templates" — mandatory for 510(k) since Oct 2023.',
    appliesWhen: 'Every 510(k) submission since October 2023.',
    requires: [
      'Use of the FDA-published eSTAR template (current version).',
      'Every required section populated (the template enforces it; missing sections RTA the submission).',
      'Submission via FDA ESG.',
    ],
  },
  {
    id: 'substantial-equivalence',
    label: 'Substantial Equivalence (SE)',
    definition:
      'A device is substantially equivalent to a predicate when it has the same intended use AND either the ' +
      'same technological characteristics OR different technological characteristics that do not raise ' +
      'different questions of safety/effectiveness AND the data demonstrate at-least-as-safe-and-effective.',
    citation: '21 CFR §807.92; FDA "The 510(k) Program: Evaluating Substantial Equivalence" Jul 2014.',
    appliesWhen: 'Every 510(k) submission must demonstrate SE.',
    requires: [
      'A primary predicate (legally marketed).',
      'Comparison of intended use, technology, energy source, materials, performance.',
      'Performance testing data when technology differs from the predicate.',
      'Clear conclusion that any technology differences do not affect safety or effectiveness.',
    ],
  },
  {
    id: 'part-11',
    label: '21 CFR Part 11 — electronic records and signatures',
    definition:
      'Part 11 governs the use of electronic records and electronic signatures in FDA-regulated processes. ' +
      'Requires audit trails, e-signature integrity, and tamper-evident records.',
    citation: '21 CFR §11.10 (controls for closed systems); §11.50, §11.70 (signature manifestations).',
    appliesWhen:
      'Every governed mutation in this platform — section approval, e-signing, ESG transmit, audit-log ' +
      'retention.',
    requires: [
      'Time-stamped audit trail for every governed mutation.',
      'Audit trail must be tamper-evident (this platform: SHA-256 hash chain in audit_events).',
      'E-signatures bound to the signed record and the signer.',
      'Reason-for-change capture on every audited mutation.',
    ],
  },
  {
    id: 'gspr',
    label: 'General Safety and Performance Requirements (EU MDR Annex I)',
    definition:
      'GSPR is the EU MDR Annex I list of safety and performance requirements every device must meet to ' +
      'be CE-marked. The sponsor maps each requirement to either "applicable" or "not applicable" with ' +
      'a justification.',
    citation: 'EU 2017/745 (MDR) Annex I; EU 2017/746 (IVDR) Annex I for IVDs.',
    appliesWhen: 'Every CE-marked device sold in the EU/EEA.',
    requires: [
      'Per-program GSPR mapping (every requirement applicable / not applicable + justification).',
      'Coverage report showing no gaps.',
      'Linked evidence supporting each "applicable" requirement.',
    ],
  },
  {
    id: 'pms-pmcf',
    label: 'Post-Market Surveillance (PMS) and Post-Market Clinical Follow-up (PMCF)',
    definition:
      'PMS is the proactive collection of real-world device performance and safety data after market launch. ' +
      'PMCF is the clinical-data subset of PMS, used to confirm the clinical evaluation continues to hold.',
    citation: 'EU MDR 2017/745 Articles 83-86 (PMS), Annex XIV Part B (PMCF).',
    appliesWhen: 'Every Class II/III device under EU MDR.',
    requires: [
      'A PMS Plan covering data sources, analysis, and trend reporting.',
      'A PMCF Plan with clinical investigations or registry pulls.',
      'Periodic Safety Update Reports (PSUR) for Class IIa+ devices.',
    ],
  },
];

// ─── Tools (derived from MDX_COMMAND_METADATA) ─────────────────────────────

export interface MdxToolEntry {
  /** Action name as registered in commandMap. */
  name: string;
  description: string;
  parameters: string;
  example: string;
  /** When AnA can/should propose this tool. */
  proposeWhen: string;
}

const proposeWhenIndex: Record<string, string> = {
  'q_sub.create':
    'When the user has a question for FDA about predicate strategy, performance testing, study ' +
    'design, or any other substantive matter that should be settled before filing.',
  'q_sub.commitment.set_rolled_in':
    'When the user has just updated an eSTAR section that addresses a captured commitment, OR when ' +
    'the user explicitly says they have rolled the change into the dossier.',
  'section.approve':
    'When validation findings are clean AND the section status is "validated" but the user wants to ' +
    'finalize the sign-off.',
  'k510_workflow.preflight':
    'When the user asks "am I ready to submit?" OR every section status is at "approved" and the ' +
    'target_submission_date is within 30 days.',
  'k510_workflow.transmit':
    'When pre-flight verdict is green, all sign-offs are recorded, AND the user has explicitly said ' +
    'they want to transmit. NEVER propose this proactively without an explicit user instruction.',
  'gspr.mapping.upsert':
    'When the user is working on EU MDR documentation and has just decided whether a GSPR row applies.',
  'post_market.document.create':
    'When the user is starting a PMS plan, PMCF plan, or any new post-market document for a program.',
  'post_market.document.approve':
    'When validation passes on a PMS/PMCF document and the user has obtained internal sign-off.',
  'post_market.document.update':
    'When the user is making a routine edit to an in-flight post-market document.',
  'post_market.document.validate':
    'Before approving a post-market document, to confirm the validation gate is clean.',
  'post_market.document.supersede':
    'When the user wants to issue a new revision of an existing post-market document.',
  'evidence_sufficiency.assess':
    'When the user asks "is my evidence enough?" OR the program has had material changes since the ' +
    'last assessment.',
  'reviewer_simulation.run':
    'When the user wants a multi-persona red-team review before filing — typically 2 weeks before ' +
    'target transmit.',
  'predicate.candidate.set_status':
    'When the user has decided on a primary or reference predicate after reviewing candidates.',
  'se_matrix.patch':
    'When the user has resolved an SE matrix row (closed a technology-difference question).',
  'correspondence.ingest':
    'When the user uploads or pastes an FDA letter (AI letter, deficiency, IR, meeting minutes).',
};

export function buildMdxToolEntries(): MdxToolEntry[] {
  const all = [
    ...MDX_COMMAND_METADATA,
    ...MDX_COMMAND_METADATA_PHASE2,
    ...MDX_COMMAND_METADATA_PHASE3,
  ];
  return all.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    example: t.example,
    proposeWhen: proposeWhenIndex[t.name] ?? 'When the user explicitly asks for this action.',
  }));
}

export const MDX_TOOLS: MdxToolEntry[] = buildMdxToolEntries();

// ─── Lookup helpers ─────────────────────────────────────────────────────────

export function getSurface(key: string): MdxSurface | null {
  return MDX_SURFACES.find(s => s.key === key) ?? null;
}

export function getWorkflow(id: string): MdxWorkflow | null {
  return MDX_WORKFLOWS.find(w => w.id === id) ?? null;
}

export function getRegulation(id: string): MdxRegulation | null {
  return MDX_REGULATIONS.find(r => r.id === id) ?? null;
}

export function getToolEntry(name: string): MdxToolEntry | null {
  return MDX_TOOLS.find(t => t.name === name) ?? null;
}

export function listSurfaceKeys(): string[] {
  return MDX_SURFACES.map(s => s.key);
}
