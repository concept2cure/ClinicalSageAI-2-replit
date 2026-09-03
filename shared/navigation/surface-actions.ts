/**
 * AnA surface-action contract — the single source of truth for "what can AnA
 * DO on a screen, and how", the sibling of the navigation contract in
 * ./index.ts.
 *
 * WHY THIS EXISTS
 * `navigate_to` lets AnA move to any registered screen; nothing let her operate
 * one. Every control a subscriber uses — open a program, run a search, switch
 * a lane, set a filter — was reachable only by telling the human where to
 * click. This registry is the governed catalog of the UNGOVERNED screen
 * operations AnA may perform, in the exact fail-closed shape the navigation
 * registry established: a typed target list, a resolver that validates id +
 * params and returns a directive or a typed error, and re-validation on the
 * client before anything is applied.
 *
 * GOVERNANCE BOUNDARY — read before adding an action
 * Only actions a signed-out reviewer could safely watch happen belong here:
 * view state (tabs, lanes, filters, searches, selections) and openers that
 * change WHAT IS SHOWN, never WHAT IS TRUE. Anything that persists a governed
 * judgment — sign, approve, submit, lock, release, delete, revoke — is
 * structurally excluded: `assertUngovernedActionId` refuses such ids, the
 * registry test walks every entry through it, and the Part 11 propose-only
 * gates (`humanConfirmed`, e-signature) remain the ONLY path for governed
 * work. Live Drive automates watching, moving, and operating view controls —
 * never approving.
 *
 * DESIGN
 * Pure data + pure functions, importable from both the server (AnA tools) and
 * the client (the surface-action bus) — same rules as ./index.ts. Action ids
 * are namespaced `<surfaceId>.<verb>` where `surfaceId` is a navigation-target
 * id from NAVIGATION_TARGETS, so an action can never point at a screen that
 * does not exist (the registry test enforces the join).
 */

import {
  findNavigationTarget,
  type NavigationParamSpec,
} from './index';

/** Param spec — identical contract to navigation params, reused deliberately. */
export type SurfaceActionParamSpec = NavigationParamSpec;

export interface SurfaceActionTarget {
  /** Canonical id AnA references: `<surfaceId>.<verb>` (e.g. "vault.search"). */
  id: string;
  /** The navigation-target id of the screen this action operates. */
  surfaceId: string;
  /** Human-readable name for the operation (overlay + chip copy). */
  label: string;
  /** What the action does and when AnA should use it. */
  description: string;
  /** Params the action accepts; required ones are enforced by the resolver. */
  params?: SurfaceActionParamSpec[];
}

/** The validated directive emitted to the client (fail-closed on both ends). */
export interface SurfaceActionDirective {
  actionType: 'surface_action';
  actionId: string;
  surfaceId: string;
  label: string;
  params?: Record<string, string>;
}

export type SurfaceActionResolution =
  | { ok: true; directive: SurfaceActionDirective }
  | {
      ok: false;
      code: 'unknown_action' | 'missing_param' | 'invalid_param' | 'governed_refused';
      error: string;
      validActions?: string[];
    };

/**
 * Verbs that name governed work. An action id containing one of these is
 * refused at registration (test) AND at resolution (runtime belt) — the
 * governed path is the Part 11 propose-only pipeline, never this registry.
 * `advance` (a change-control lifecycle transition is an e-signed ceremony)
 * and `launch` (starting a metered job is a spend, which gets the same
 * structural exclusion as a signature) joined with wave 4. `grant` (a module
 * grant is an entitlement change), `checkout` and `purchase` (payment starts)
 * joined with wave 6, when the admin and licensing consoles became operable.
 */
export const GOVERNED_VERB_PATTERN =
  /\b(sign|esign|e-sign|approve|reject|submit|transmit|lock|unlock|release|revoke|delete|destroy|certify|attest|countersign|freeze|dispatch|accept|advance|launch|grant|checkout|purchase)\b/i;

/** Throws for an action id that names governed work. Exported for the tests. */
export function assertUngovernedActionId(id: string): void {
  if (GOVERNED_VERB_PATTERN.test(id)) {
    throw new Error(
      `Surface action id "${id}" names governed work — governed actions are ` +
        `propose-only and never enter the surface-action registry.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY — every entry is genuinely handled by its surface (the client bus
// warns when a surface registers ids not listed here; the totality test walks
// each entry's surfaceId into NAVIGATION_TARGETS and its id through the
// governed-verb refusal). Grow this list together with the surface handlers,
// never ahead of them — an action AnA can resolve but no surface performs is
// a fabricated ability.
// ─────────────────────────────────────────────────────────────────────────────

export const SURFACE_ACTIONS: readonly SurfaceActionTarget[] = [
  {
    id: 'projects.open-program',
    surfaceId: 'projects',
    label: 'Open a program',
    description:
      'On the Projects portfolio, open a named regulatory program — sets it as the active project (so project-scoped screens work) and enters its project home. Pass the program title or code as shown on screen; the surface resolves it against the real portfolio and reports an honest miss for an unknown name.',
    params: [
      {
        name: 'program',
        required: true,
        description: 'The program title or code to open, as listed on the Projects surface (e.g. "BX-204" or a program title).',
      },
    ],
  },
  {
    id: 'projects.filter',
    surfaceId: 'projects',
    label: 'Filter the portfolio',
    description:
      'On the Projects portfolio, filter the program list by workstream and/or status. Omit a param to leave that axis unchanged; pass "all" to clear it.',
    params: [
      {
        name: 'workstream',
        required: false,
        description: 'Workstream filter: "all", "MDX", "Biotech", or "Pharma".',
        enum: ['all', 'MDX', 'Biotech', 'Pharma'],
      },
      {
        name: 'status',
        required: false,
        description: 'Status filter: "all", "active", "blocked", or "complete".',
        enum: ['all', 'active', 'blocked', 'complete'],
      },
    ],
  },
  {
    id: 'projects.set-view',
    surfaceId: 'projects',
    label: 'Switch portfolio view',
    description: 'On the Projects portfolio, switch between the grid and list presentation of the programs.',
    params: [
      {
        name: 'view',
        required: true,
        description: 'Which presentation to show.',
        enum: ['grid', 'list'],
      },
    ],
  },
  {
    id: 'vault.search',
    surfaceId: 'vault',
    label: 'Search the vault',
    description:
      'On the project Vault, run a document search — filters the filing-cabinet tree and document list to title matches for the term the user asked about.',
    params: [
      {
        name: 'query',
        required: true,
        description: 'The search term to filter vault documents by (title match).',
      },
    ],
  },
  {
    id: 'vault.open-folder',
    surfaceId: 'vault',
    label: 'Open a vault folder',
    description:
      'On the project Vault, open a named folder of the filing cabinet (e.g. "Module 3", "Unfiled") so its documents are listed. Resolved against the real tree; an unknown folder name is an honest miss, never a guess.',
    params: [
      {
        name: 'folder',
        required: true,
        description: 'The folder name as shown in the vault tree (case-insensitive; partial names resolve when unambiguous).',
      },
    ],
  },

  // ── Task board (nav target 'tasking' → the tasks surface) ──
  {
    id: 'tasking.set-view',
    surfaceId: 'tasking',
    label: 'Switch the task board view',
    description:
      'On the task board, switch between the Board (kanban), Critical path, Analytics, and Table presentations.',
    params: [
      {
        name: 'view',
        required: true,
        description: 'Which presentation to show.',
        enum: ['board', 'path', 'analytics', 'table'],
      },
    ],
  },
  {
    id: 'tasking.filter',
    surfaceId: 'tasking',
    label: 'Filter the task board',
    description:
      'On the task board, filter by programme and/or module (both resolved against the live options on screen — pass the name as shown; "all" clears an axis), and/or toggle the My-tasks view. At least one param must be given. There is no status/priority/assignee filter on this board — status shows as the kanban columns.',
    params: [
      {
        name: 'project',
        required: false,
        description: 'Programme name (as listed in the project picker) or "all" to clear.',
      },
      {
        name: 'module',
        required: false,
        description: 'Module name (as listed in the module picker) or "all" to clear.',
      },
      {
        name: 'mine',
        required: false,
        description: 'Show only the user\'s own tasks ("true") or everyone\'s ("false").',
        enum: ['true', 'false'],
      },
    ],
  },
  {
    id: 'tasking.open-task',
    surfaceId: 'tasking',
    label: 'Open a task',
    description:
      'On the task board, open a task\'s detail panel by its id or title, resolved against the tasks currently on screen under the active filters. Ambiguous or unknown names are honest refusals. Refused while a task detail with an in-progress archive justification, a form, or a signature ceremony is open.',
    params: [
      {
        name: 'task',
        required: true,
        description: 'The task id or title as shown on the board (case-insensitive; partial titles resolve when unambiguous).',
      },
    ],
  },

  // ── Review (ungoverned selection only — decisions/sign-offs stay human) ──
  {
    id: 'review.select-document',
    surfaceId: 'review',
    label: 'Select a document in the review queue',
    description:
      'On the Review board, select a queued document by title so its workflow, passage, and comments show. View selection only — recording a decision, requesting changes, delegating, and commenting remain governed human acts. Refused while a request-changes or delegate form holds an in-progress justification.',
    params: [
      {
        name: 'document',
        required: true,
        description: 'The document title as shown in the queue (case-insensitive; partial titles resolve when unambiguous).',
      },
    ],
  },
  {
    id: 'review.open-queue',
    surfaceId: 'review',
    label: 'Open the review queue',
    description:
      'On the Review board, jump to the next document still awaiting a decision — selects it and scrolls the queue into view. Honest refusals when nothing is in review or every document is already approved.',
  },

  // ── CMC / Quality (Module 3) ──
  {
    id: 'cmc.open-tab',
    surfaceId: 'cmc',
    label: 'Open a CMC tab',
    description:
      'On the CMC workstream, open one of its tabs: overview, substance & product (materials), specifications (specs), stability, batch records (batch), change control (change), quality by design (quality), Module 3 build (build), or program records (pathway). Refused while a governed form is open in the current pane (spec edits, batch e-sign releases, stability registrations report themselves through the ceremony channel) — a switch would discard the person’s half-completed ceremony.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab id to open.',
        enum: ['overview', 'materials', 'specs', 'stability', 'batch', 'change', 'quality', 'build', 'pathway'],
      },
    ],
  },

  // ── Intelligence (global regulatory intelligence browser) ──
  {
    id: 'intelligence.open-group',
    surfaceId: 'intelligence',
    label: 'Open an intelligence group',
    description:
      'On the Intelligence browser, switch the capability catalog to a named group. Refused while a capability detail is open (its form would be discarded) — close it first.',
    params: [
      {
        name: 'group',
        required: true,
        description: 'The group id to show.',
        enum: [
          'strategy',
          'designations_access',
          'clinical',
          'quality_cmc',
          'safety_pv',
          'submissions',
          'devices_dx',
          'lifecycle',
          'commercial_supply',
        ],
      },
    ],
  },
  {
    id: 'intelligence.open-capability',
    surfaceId: 'intelligence',
    label: 'Open an intelligence capability',
    description:
      'On the Intelligence browser, open a capability\'s detail by name (resolved against the live catalog; unknown or ambiguous names are honest refusals). Opening shows its inputs — RUNNING a capability stays with the user.',
    params: [
      {
        name: 'capability',
        required: true,
        description: 'The capability name or id as listed in the catalog (case-insensitive; partial names resolve when unambiguous).',
      },
    ],
  },
  {
    id: 'intelligence.close-capability',
    surfaceId: 'intelligence',
    label: 'Back to the capability catalog',
    description:
      'On the Intelligence browser, close the open capability detail and return to the catalog. A refusal when no capability is open. Note: closing discards anything typed into the capability form.',
  },

  // ── Document authoring (the unified editor; nav target "authoring") ──
  {
    id: 'authoring.open-document',
    surfaceId: 'authoring',
    label: 'Open a document for authoring',
    description:
      'In the authoring editor, open a document from the in-scope list by title (normalized exact match, then unique containment — the same resolution the deep-link hand-off uses). Refused with the real reason while there are unsaved edits, a save is in flight, or a dialog is open — AnA never discards a person\'s typing.',
    params: [
      {
        name: 'title',
        required: true,
        description: 'The document title as listed in the authoring tree (case-insensitive; partial titles resolve when unambiguous).',
      },
    ],
  },
  {
    id: 'authoring.open-section',
    surfaceId: 'authoring',
    label: 'Open a section of the open document',
    description:
      'In the authoring editor, jump to a section of the CURRENTLY OPEN document by its code (e.g. "3.2.P.8"). For a section in another document, use navigate_to authoring with sectionCode instead — that path runs the bounded cross-document search. Same unsaved-edits refusals as opening a document.',
    params: [
      {
        name: 'sectionCode',
        required: true,
        description: 'The CTD/outline section code as shown in the section tree of the open document.',
      },
    ],
  },
  {
    id: 'authoring.find',
    surfaceId: 'authoring',
    label: 'Find text in the open section',
    description:
      'In the authoring editor, open the find & replace bar over the open section, optionally pre-seeded with a search term — the same bar as Ctrl/⌘-F, highlights and match counter included. Read-only: replacing text stays a human act. Refused while a dialog or save owns the canvas, and honestly unavailable when the section is in raw-HTML source mode (the browser\'s own find works there).',
    params: [
      {
        name: 'query',
        required: false,
        description: 'Text to find. When omitted the bar opens seeded from the current selection.',
      },
    ],
  },

  // ── eCTD co-author ──
  {
    id: 'ectd-coauthor.search-tree',
    surfaceId: 'ectd-coauthor',
    label: 'Search the eCTD tree',
    description:
      'On the eCTD co-author, filter the backbone tree by title or module number — pure view state over the loaded documents; zero matches is a truthful result, not an error.',
    params: [
      {
        name: 'query',
        required: true,
        description: 'The search term to filter the eCTD section tree by (title or module number).',
      },
    ],
  },
  {
    id: 'ectd-coauthor.open-tab',
    surfaceId: 'ectd-coauthor',
    label: 'Open a co-author tab',
    description:
      'On the eCTD co-author, switch between the document, validation, and compliance tabs. View only — unlike the human tab buttons it never starts a validation or compliance run (those issue server checks and stay human clicks); a tab whose report has not been run shows its honest idle state, and the detail says so. Refused while the open document holds unsaved edits — the editor unmounts on a tab switch.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['document', 'validation', 'compliance'],
      },
    ],
  },
  {
    id: 'ectd-coauthor.open-document',
    surfaceId: 'ectd-coauthor',
    label: 'Open an eCTD document',
    description:
      'On the eCTD co-author, open a document from the backbone by title or module number (e.g. "2.5") — the same tree click a person makes, with the module expanded so the row shows. Refused with the real reason while the open document holds unsaved edits or a validation/compliance check is running — AnA never discards a person\'s typing.',
    params: [
      {
        name: 'document',
        required: true,
        description:
          'The document title or module number as listed in the eCTD tree (case-insensitive; partial titles resolve when unambiguous).',
      },
    ],
  },

  // ── Submission Center (nav target "submissions") ──
  {
    id: 'submissions.set-workspace',
    surfaceId: 'submissions',
    label: 'Switch the submission workspace',
    description:
      'In the Submission Center, switch between its workspaces. The builder, validation, shadow-review, cross-region, and dispatch workspaces need a submission (and sequence) selected first — select one before switching there. Refused while an e-signature dialog is open or a lifecycle transition is in flight.',
    params: [
      {
        name: 'workspace',
        required: true,
        description: 'The workspace tab to open.',
        enum: [
          'portfolio',
          'planner',
          'builder',
          'sequences',
          'validation',
          'shadow-review',
          'cross-region',
          'dispatch',
        ],
      },
    ],
  },
  {
    id: 'submissions.select-submission',
    surfaceId: 'submissions',
    label: 'Select a submission',
    description:
      'In the Submission Center, select a submission by title or product name (resolved against the live portfolio; unknown or ambiguous names are honest refusals). Note: selecting clears the working sequence and any verdict notice on screen. Refused while an e-signature dialog is open or a transition is in flight.',
    params: [
      {
        name: 'submission',
        required: true,
        description: 'The submission title or product name as listed in the portfolio (case-insensitive; partial names resolve when unambiguous).',
      },
    ],
  },
  {
    id: 'submissions.select-sequence',
    surfaceId: 'submissions',
    label: 'Select a working sequence',
    description:
      'In the Submission Center, select the working sequence (by its number, e.g. "0000") that the build, validation, and dispatch workspaces act on. Requires a submission selected. Refused while an e-signature dialog is open or a transition is in flight. Freezing and dispatching remain governed human acts.',
    params: [
      {
        name: 'sequence',
        required: true,
        description: 'The sequence number as rendered in the sequence list (e.g. "0000").',
      },
    ],
  },

  // ── Project home ──
  {
    id: 'project-home.set-stage',
    surfaceId: 'project-home',
    label: 'Open a lifecycle stage',
    description:
      'On the project home, open a programme lifecycle stage tab. Note: leaving the author stage unmounts its composer — do not switch away from author uninvited if the user may be mid-message there.',
    params: [
      {
        name: 'stage',
        required: true,
        description: 'The lifecycle stage tab to open.',
        enum: ['plan', 'evidence', 'author', 'review', 'submit', 'respond', 'lifecycle'],
      },
    ],
  },

  // ── Risk management (ISO 14971 file) ──
  {
    id: 'risk.set-matrix-view',
    surfaceId: 'risk',
    label: 'Switch the risk matrix view',
    description:
      'On the risk file, switch the severity × probability matrix between the initial and residual assessments. Refused while a new-hazard or add-control form is open.',
    params: [
      {
        name: 'view',
        required: true,
        description: 'Which assessment to show.',
        enum: ['initial', 'residual'],
      },
    ],
  },
  {
    id: 'risk.select-hazard',
    surfaceId: 'risk',
    label: 'Open a hazard',
    description:
      'On the risk file, open a hazard by its reference (e.g. "HZ-01") or hazard text so its severity, probability, and controls show. Resolved against the real risk file with honest misses. Accepting residual risk stays a governed human act. Refused while a form is open.',
    params: [
      {
        name: 'hazard',
        required: true,
        description: 'The hazard reference or text as listed in the register (case-insensitive; partial text resolves when unambiguous).',
      },
    ],
  },
  {
    id: 'risk.focus-cell',
    surfaceId: 'risk',
    label: 'Focus a matrix cell',
    description:
      'On the risk file, focus a severity × probability cell of the matrix and open the hazard sitting there (the first, when several share the cell — the count is reported). An empty cell is an honest miss. Refused while a form is open.',
    params: [
      {
        name: 'severity',
        required: true,
        description: 'The severity band, exactly as labelled on the matrix axis.',
        enum: ['Negligible', 'Minor', 'Serious', 'Critical', 'Catastrophic'],
      },
      {
        name: 'probability',
        required: true,
        description: 'The probability band, exactly as labelled on the matrix axis.',
        enum: ['Improbable', 'Remote', 'Occasional', 'Probable', 'Frequent'],
      },
      {
        name: 'view',
        required: false,
        description: 'Which assessment to read the cell from (defaults to the one on screen).',
        enum: ['initial', 'residual'],
      },
    ],
  },

  // ── Template library ──
  {
    id: 'template-library.select-template',
    surfaceId: 'template-library',
    label: 'Select a template',
    description:
      'In the template library, select a template by name so its preview opens — the same click a person makes on the list. Refused while an unsaved extraction preview is on screen (selecting under it is disorienting and its Discard is unrecoverable). Note: selection re-points the render/verify/apply toolbar at the newly selected template.',
    params: [
      {
        name: 'template',
        required: true,
        description: 'The template name as shown in the list (case-insensitive; partial names resolve when unambiguous).',
      },
    ],
  },
  {
    id: 'template-library.open-tab',
    surfaceId: 'template-library',
    label: 'Open a template tab',
    description:
      'In the template library, open one of the selected template\'s tabs: live preview, specification, form fields, named styles, or the saved extraction report (read-only — it never starts an extraction).',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['preview', 'spec', 'fields', 'styles', 'extract'],
      },
    ],
  },

  // ── Artifacts center ──
  {
    id: 'artifacts-center.focus-artifact',
    surfaceId: 'artifacts-center',
    label: 'Focus an artifact',
    description:
      'In the artifacts center, bring a named artifact into view and highlight it — the same focus the follow-the-work hand-off applies when a driven turn saves a draft. Resolved against the real gallery with honest misses.',
    params: [
      {
        name: 'artifact',
        required: true,
        description: 'The artifact name as shown in the gallery (case-insensitive; partial names resolve when unambiguous).',
      },
    ],
  },

  // ── Quality (SOP register / change control) ──
  {
    id: 'quality.open-tab',
    surfaceId: 'quality',
    label: 'Open a quality tab',
    description:
      'On the quality surface, switch between the SOP register and change control tabs. Approving, revising, or retiring a controlled document, raising or advancing a change, and recording training are governed acts that stay in conversation — never driven from here.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['sop', 'change'],
      },
    ],
  },
  {
    id: 'quality.filter-register',
    surfaceId: 'quality',
    label: 'Filter the SOP register',
    description:
      'Filter the controlled-document register by status — the same chips a person clicks. Opens the SOP register tab first when change control is showing. Superseded and retired documents are only listed under "all"; the register has no chip for them.',
    params: [
      {
        name: 'status',
        required: true,
        description: 'The status chip to apply.',
        enum: ['all', 'effective', 'in_review', 'draft'],
      },
    ],
  },
  {
    id: 'quality.filter-changes',
    surfaceId: 'quality',
    label: 'Filter the change log',
    description:
      'Filter the change-control log to one lifecycle stage — the same selection the flowchart nodes make. Opens the change control tab first when the SOP register is showing.',
    params: [
      {
        name: 'stage',
        required: true,
        description: 'The lifecycle stage to filter to.',
        enum: [
          'all',
          'proposed',
          'under_assessment',
          'approved',
          'rejected',
          'in_implementation',
          'verification',
          'closed',
          'cancelled',
        ],
      },
    ],
  },
  {
    id: 'quality.open-change',
    surfaceId: 'quality',
    label: 'Expand a change record',
    description:
      'Expand a change record to its linked deviations, CAPAs, validations and documents, by change number (e.g. "CC-2026-014") or title. Opens the change control tab first when needed and clears a stage filter that would hide the row (the detail says so). Resolved against the real change log with honest misses. Advancing a change stays a governed human ceremony.',
    params: [
      {
        name: 'change',
        required: true,
        description:
          'The change number or title as listed in the log (case-insensitive; partial titles resolve when unambiguous).',
      },
    ],
  },

  // ── eCTD publishing reference (read-only surface; these switch views) ──
  {
    id: 'ectd-publishing.set-version',
    surfaceId: 'ectd-publishing',
    label: 'Switch the eCTD version',
    description:
      'On the eCTD publishing reference, switch between the v4.0 (HL7 RPS) and v3.2.2 views. View-only — nothing on this surface publishes, transmits, or freezes a sequence.',
    params: [
      { name: 'version', required: true, description: 'The spec version to show.', enum: ['v4.0', 'v3.2.2'] },
    ],
  },
  {
    id: 'ectd-publishing.open-list',
    surfaceId: 'ectd-publishing',
    label: 'Open a controlled-vocabulary list',
    description:
      'Open one of the v4.0 controlled-vocabulary code lists by its id (e.g. "contextOfUse", "submissionType"). Resolved against the live listing with honest misses; v3.2.2 has no per-list browser and the refusal says so.',
    params: [
      { name: 'list', required: true, description: 'The vocabulary list id as shown in the picker.' },
    ],
  },
  {
    id: 'ectd-publishing.filter-codes',
    surfaceId: 'ectd-publishing',
    label: 'Filter the code list',
    description: 'Filter the open vocabulary list’s codes by text — zero matches is a truthful result.',
    params: [{ name: 'query', required: true, description: 'Text to filter codes and descriptions by.' }],
  },

  // ── Submission pyramid ──
  {
    id: 'pyramid.select-type',
    surfaceId: 'pyramid',
    label: 'Pick a submission type',
    description:
      'On the submission pyramid, pick a submission type from the live catalog by id or label — the same card click a person makes. Honest misses; held while the type list loads.',
    params: [
      { name: 'type', required: true, description: 'The submission type id or label as listed in the picker.' },
    ],
  },
  {
    id: 'pyramid.open-tab',
    surfaceId: 'pyramid',
    label: 'Open a pyramid tab',
    description: 'Switch between the dashboard, work-breakdown, analytics, and global-submissions tabs.',
    params: [
      { name: 'tab', required: true, description: 'The tab to open.', enum: ['dashboard', 'wbs', 'analytics', 'global'] },
    ],
  },
  {
    id: 'pyramid.focus-phase',
    surfaceId: 'pyramid',
    label: 'Focus a phase',
    description:
      'Focus one phase of the work breakdown (opens the work-breakdown tab). Resolved against the live pyramid with honest misses. Changing a task status stays a persisted human act.',
    params: [
      { name: 'phase', required: true, description: 'The phase id or label as shown on the pyramid.' },
    ],
  },
  {
    id: 'pyramid.open-task',
    surfaceId: 'pyramid',
    label: 'Open a task sheet',
    description:
      'Open a task’s detail sheet by name or id — a read-only view; its status control stays a human act. Honest misses and ambiguity refusals.',
    params: [
      { name: 'task', required: true, description: 'The task name or id as listed (case-insensitive; partial names resolve when unambiguous).' },
    ],
  },

  // ── Precedent intelligence ──
  {
    id: 'precedent-intelligence.open-tab',
    surfaceId: 'precedent-intelligence',
    label: 'Open an analysis tab',
    description:
      'On the precedent board, switch the analysis tab for the selected clearance. Refused until a search has been run — AnA never runs the search herself.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The analysis tab to open.',
        enum: ['risk', 'strategy', 'crl', 'rtf', 'ema', 'adcomm'],
      },
    ],
  },
  {
    id: 'precedent-intelligence.select-result',
    surfaceId: 'precedent-intelligence',
    label: 'Select a precedent',
    description:
      'Select one of the returned clearances by K-number or device name — the same row click a person makes. Refused until a search has been run; honest misses.',
    params: [
      { name: 'result', required: true, description: 'The clearance number or device name as listed in the results.' },
    ],
  },

  // ── Prescribing information (labeling) ──
  {
    id: 'labeling-pi.set-format',
    surfaceId: 'labeling-pi',
    label: 'Switch the label format',
    description:
      'Switch between the USPI, EU SmPC, and SPL views. View-only: accepting agency text, exporting, and building SPL stay governed human acts, and the reason field is never filled.',
    params: [
      { name: 'format', required: true, description: 'The label view to open.', enum: ['uspi', 'smpc', 'spl'] },
    ],
  },
  {
    id: 'labeling-pi.open-section',
    surfaceId: 'labeling-pi',
    label: 'Open a label section',
    description:
      'On the USPI view, open a numbered section from the real worklist — the same tree click a person makes. Honest misses; held while the worklist loads.',
    params: [
      { name: 'section', required: true, description: 'The section number or heading as listed (e.g. "1", "Boxed Warning").' },
    ],
  },

  // ── Orchestration ──
  {
    id: 'orchestration.set-view',
    surfaceId: 'orchestration',
    label: 'Switch the orchestration view',
    description:
      'Switch between the runs, approvals, and readiness views. Approving or rejecting a gate, starting, retrying or cancelling a run, and re-evaluating readiness stay human acts.',
    params: [
      { name: 'view', required: true, description: 'The view to open.', enum: ['runs', 'approvals', 'readiness'] },
    ],
  },
  {
    id: 'orchestration.select-run',
    surfaceId: 'orchestration',
    label: 'Select a workflow run',
    description:
      'Select a workflow run by title or id so its steps, outputs, and blockers show — the same row click a person makes. Honest misses; held while the runs load.',
    params: [
      { name: 'run', required: true, description: 'The run title or id as listed (case-insensitive; partial titles resolve when unambiguous).' },
    ],
  },

  // ── Inconsistency board ──
  {
    id: 'inconsistency.set-regulator',
    surfaceId: 'inconsistency',
    label: 'Switch the regulator overlay',
    description:
      'On the inconsistency board, switch the FDA/EMA overlay — a client-side re-scoring of the same findings; the applied detail restates the gate verdict under the new overlay. Scans, resolutions, and assumption revaluations stay governed human acts.',
    params: [
      { name: 'regulator', required: true, description: 'The regulator overlay to apply.', enum: ['FDA', 'EMA'] },
    ],
  },

  // ── Capability catalog ──
  {
    id: 'intelligence-catalog.filter',
    surfaceId: 'intelligence-catalog',
    label: 'Filter the capability catalog',
    description:
      'Filter AnA’s tool catalog by name — pure view state; zero matches is a truthful result. Running a tool stays the person’s request.',
    params: [{ name: 'query', required: true, description: 'Text to filter domains and tools by.' }],
  },

  // ── Change assessment ──
  {
    id: 'change-assessment.select-change',
    surfaceId: 'change-assessment',
    label: 'Select a change',
    description:
      'Select a change from the worklist by id or title so its FDA / EU MDR determinations show — the same row click a person makes. Honest misses; held while the worklist loads.',
    params: [
      { name: 'change', required: true, description: 'The change id or title as listed (case-insensitive; partial titles resolve when unambiguous).' },
    ],
  },

  // ── Document journey ──
  {
    id: 'doc-journey.select-stage',
    surfaceId: 'doc-journey',
    label: 'Select a lifecycle stage',
    description:
      'On the document journey rail, select a recorded stage so its snapshot shows — read-only over the real audit trail. Honest misses; held while the journey loads.',
    params: [
      { name: 'stage', required: true, description: 'The stage label or id as shown on the rail.' },
    ],
  },

  // ── Biostatistics designer ──
  {
    id: 'biostatistics.set-preset',
    surfaceId: 'biostatistics',
    label: 'Apply a design preset',
    description:
      'Apply one of the deterministic design presets — a pure client-side recompute; nothing is filed. Opening in the editor and attaching to the dossier stay governed human acts.',
    params: [
      { name: 'preset', required: true, description: 'The design preset to apply.', enum: ['survival', 'binary', 'ni', 'ivd'] },
    ],
  },
  {
    id: 'biostatistics.set-doc-type',
    surfaceId: 'biostatistics',
    label: 'Switch the statistical document type',
    description:
      'Switch which governed statistical document the engine drafts — a pure client-side recompute; filing stays a human act.',
    params: [
      {
        name: 'docType',
        required: true,
        description: 'The document type to draft.',
        enum: [
          'sample_size_rationale',
          'full_statistical_analysis_plan',
          'sap_section_draft',
          'protocol_statistical_section',
          'statistical_methods_section',
          'statistical_risk_memo',
          'design_assumption_note',
          'interim_analysis_plan',
          'dsmb_charter',
          'tlf_shell_plan',
          'randomization_plan',
        ],
      },
    ],
  },

  // ── Research administration ──
  {
    id: 'research-admin.open-section',
    surfaceId: 'research-admin',
    label: 'Open a research-admin section',
    description:
      'Switch between the research-administration sections. Four of five are not connected to the workspace and say so honestly; training shows the live CITI matrix.',
    params: [
      {
        name: 'section',
        required: true,
        description: 'The section to open.',
        enum: ['committees', 'coverage', 'grants', 'training', 'portfolio'],
      },
    ],
  },

  // ── Admin & access ──
  {
    id: 'admin-console.open-tab',
    surfaceId: 'admin-console',
    label: 'Open an admin tab',
    description:
      'On Admin & access, switch between the members, roles, SSO, API-keys, and settings tabs. Inviting, granting, editing scopes, revoking keys, and changing settings stay governed administrator acts.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['members', 'roles', 'sso', 'apikeys', 'settings'],
      },
    ],
  },
  {
    id: 'admin-console.filter-members',
    surfaceId: 'admin-console',
    label: 'Filter the member list',
    description: 'Filter the member list by state — the same chips a person clicks (opens the members tab first when needed).',
    params: [
      { name: 'state', required: true, description: 'The member state to filter to.', enum: ['all', 'active', 'invited', 'disabled'] },
    ],
  },

  // ── Access requests ──
  {
    id: 'access-requests.set-filter',
    surfaceId: 'access-requests',
    label: 'Switch the request filter',
    description:
      'Switch the access-request queue between waiting-only and everything. Approving or declining a request stays a governed administrator decision.',
    params: [
      { name: 'show', required: true, description: 'Which requests to list.', enum: ['waiting', 'everything'] },
    ],
  },

  // ── Master licensing (platform owner) ──
  {
    id: 'master-licensing.open-tab',
    surfaceId: 'master-licensing',
    label: 'Open a licensing tab',
    description:
      'On master licensing, switch between the console tabs. Every change on this console — packaging, entitlements, flags, enforcement — stays a governed platform-owner act; workspace selection is not driven (it fires a cross-tenant read).',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['packaging', 'tenants', 'access-requests', 'trials', 'flags', 'enforcement', 'history'],
      },
    ],
  },
  {
    id: 'master-licensing.filter-modules',
    surfaceId: 'master-licensing',
    label: 'Filter the module catalog',
    description: 'On the packaging tab, filter the module catalog by category — a local view filter (opens the packaging tab first when needed).',
    params: [
      { name: 'category', required: true, description: 'The category as shown in the picker, or "all".' },
    ],
  },
  {
    id: 'master-licensing.search-modules',
    surfaceId: 'master-licensing',
    label: 'Search the module catalog',
    description: 'On the packaging tab, search modules by name — a local view filter; zero matches is a truthful result.',
    params: [{ name: 'query', required: true, description: 'Text to search module names for.' }],
  },

  // ── Plans & licensing ──
  {
    id: 'licensing.set-pricing-model',
    surfaceId: 'licensing',
    label: 'Switch the pricing catalog',
    description:
      'Switch between the self-service and enterprise per-user catalogs — a view switch over public pricing config. Choosing a plan (Stripe checkout) and the seat count stay human acts.',
    params: [
      { name: 'model', required: true, description: 'The catalog to show.', enum: ['dtc', 'b2b'] },
    ],
  },
  {
    id: 'licensing.set-cycle',
    surfaceId: 'licensing',
    label: 'Switch the billing cycle view',
    description: 'Switch the displayed pricing between monthly and annual — a view switch; nothing is purchased.',
    params: [
      { name: 'cycle', required: true, description: 'The cycle to display.', enum: ['monthly', 'annual'] },
    ],
  },

  // ── Authoring engine (capability reference) ──
  {
    id: 'authoring-engine.open-tab',
    surfaceId: 'authoring-engine',
    label: 'Open an authoring-engine tab',
    description: 'Switch between the capability-reference tabs. The page reads no programs; drafting stays the person’s request.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['pyramid', 'systems', 'templates', 'automations'],
      },
    ],
  },
  {
    id: 'authoring-engine.select-system',
    surfaceId: 'authoring-engine',
    label: 'Select a document system',
    description: 'On the systems tab, select one of the twelve document systems so its guarantees and checks show (opens the systems tab first when needed).',
    params: [
      {
        name: 'system',
        required: true,
        description: 'The document system to select.',
        enum: ['co25', 'sce273', 'scs274', 'nc26', 'csr', 'proto', 'cmcs', 'cmcp', 'issise', 'uspi', 'brief', 'psur'],
      },
    ],
  },

  // ── PDEV workstreams (one entry per workstream surface; same controls) ──
  {
    id: 'pdev-cmc.filter-activities',
    surfaceId: 'pdev-cmc',
    label: 'Filter CMC activities',
    description:
      'Filter the CMC workstream’s activities by state — the same chips a person clicks; a chip with zero activities is not offered and the refusal says so. State changes, evidence, drafts and workflow decisions stay governed human acts.',
    params: [
      { name: 'state', required: true, description: 'The activity state to filter to.', enum: ['all', 'drafting', 'in_review', 'revision_required', 'approved'] },
    ],
  },
  {
    id: 'pdev-cmc.set-view',
    surfaceId: 'pdev-cmc',
    label: 'Switch the CMC view',
    description: 'Switch the CMC workstream between grid and list — sticky per browser (localStorage), and the detail says so.',
    params: [
      { name: 'view', required: true, description: 'The view mode.', enum: ['grid', 'list'] },
    ],
  },
  {
    id: 'pdev-nonclinical.filter-activities',
    surfaceId: 'pdev-nonclinical',
    label: 'Filter nonclinical activities',
    description:
      'Filter the nonclinical workstream’s activities by state — the same chips a person clicks; a chip with zero activities is not offered. Governed acts stay human.',
    params: [
      { name: 'state', required: true, description: 'The activity state to filter to.', enum: ['all', 'drafting', 'in_review', 'revision_required', 'approved'] },
    ],
  },
  {
    id: 'pdev-nonclinical.set-view',
    surfaceId: 'pdev-nonclinical',
    label: 'Switch the nonclinical view',
    description: 'Switch the nonclinical workstream between grid and list — sticky per browser, stated in the detail.',
    params: [
      { name: 'view', required: true, description: 'The view mode.', enum: ['grid', 'list'] },
    ],
  },
  {
    id: 'pdev-clinical.filter-activities',
    surfaceId: 'pdev-clinical',
    label: 'Filter clinical activities',
    description:
      'Filter the clinical workstream’s activities by state — the same chips a person clicks; a chip with zero activities is not offered. Governed acts stay human.',
    params: [
      { name: 'state', required: true, description: 'The activity state to filter to.', enum: ['all', 'drafting', 'in_review', 'revision_required', 'approved'] },
    ],
  },
  {
    id: 'pdev-clinical.set-view',
    surfaceId: 'pdev-clinical',
    label: 'Switch the clinical view',
    description: 'Switch the clinical workstream between grid and list — sticky per browser, stated in the detail.',
    params: [
      { name: 'view', required: true, description: 'The view mode.', enum: ['grid', 'list'] },
    ],
  },
  {
    id: 'pdev-regulatory.filter-activities',
    surfaceId: 'pdev-regulatory',
    label: 'Filter regulatory activities',
    description:
      'Filter the regulatory workstream’s activities by state — the same chips a person clicks; a chip with zero activities is not offered. Governed acts stay human.',
    params: [
      { name: 'state', required: true, description: 'The activity state to filter to.', enum: ['all', 'drafting', 'in_review', 'revision_required', 'approved'] },
    ],
  },
  {
    id: 'pdev-regulatory.set-view',
    surfaceId: 'pdev-regulatory',
    label: 'Switch the regulatory view',
    description: 'Switch the regulatory workstream between grid and list — sticky per browser, stated in the detail.',
    params: [
      { name: 'view', required: true, description: 'The view mode.', enum: ['grid', 'list'] },
    ],
  },
  {
    id: 'pdev-contradictions.select-contradiction',
    surfaceId: 'pdev-contradictions',
    label: 'Select a contradiction',
    description:
      'Select a contradiction from the registry by id or object name so its detail shows — the same row click a person makes. Review-state changes stay governed human acts.',
    params: [
      { name: 'contradiction', required: true, description: 'The contradiction id or an object name from the row (case-insensitive; partial names resolve when unambiguous).' },
    ],
  },

  // ── Market access / HEOR ──
  {
    id: 'market-access.open-tab',
    surfaceId: 'market-access',
    label: 'Open a market-access tab',
    description:
      'On the market-access workspace, switch between the coverage-status, value-dossier, coding-strategy, and access-strategy tabs.',
    params: [
      { name: 'tab', required: true, description: 'The tab to open.', enum: ['coverage', 'dossier', 'coding', 'strategy'] },
    ],
  },

  // ── IND checklist / lifecycle ──
  {
    id: 'ind-checklist.open-tab',
    surfaceId: 'ind-checklist',
    label: 'Open an IND tab',
    description: 'On the IND surface, switch between the File-the-IND checklist and the Lifecycle view.',
    params: [
      { name: 'tab', required: true, description: 'The tab to open.', enum: ['file', 'lifecycle'] },
    ],
  },

  // ── NDA/BLA cockpit ──
  {
    id: 'nda-cockpit.open-tab',
    surfaceId: 'nda-cockpit',
    label: 'Open an NDA/BLA cockpit tab',
    description:
      'On the NDA/BLA cockpit, switch between CTD readiness, Module 1 admin, the PDUFA review clock, Refuse-to-File risk, and BLA biologics.',
    params: [
      { name: 'tab', required: true, description: 'The tab to open.', enum: ['ctd', 'm1', 'clock', 'rtf', 'bla'] },
    ],
  },

  // ── Mission control ──
  {
    id: 'mission-control.select-program',
    surfaceId: 'mission-control',
    label: 'Select a program',
    description:
      'On mission control, select a program by name or code so its cross-program status shows — the same row click a person makes. Resolved against the real portfolio with honest misses; held while it loads.',
    params: [
      { name: 'program', required: true, description: 'The program name or code as listed (case-insensitive; partial names resolve when unambiguous).' },
    ],
  },

  // ── Health-authority questions ──
  {
    id: 'haq-manager.select-question',
    surfaceId: 'haq-manager',
    label: 'Open a health-authority question',
    description:
      'On the HAQ manager, open an agency question by its id or its text so its analysis, draft and commitments show. Drafting an answer and committing a response stay governed human acts. Honest misses; held while the rounds load.',
    params: [
      { name: 'question', required: true, description: 'The question id (e.g. "HAQ-01") or a distinctive phrase from its text.' },
    ],
  },

  // ── Biostatistics workbench ──
  {
    id: 'biostat-workbench.select-calculator',
    surfaceId: 'biostat-workbench',
    label: 'Open a design engine',
    description:
      'On the biostatistics workbench, open one of the design engines (assurance, group-sequential, sample size, multiplicity, and the rest) by its name so its inputs show — the same tile click a person makes. Computing a result stays a deliberate act; this only opens the engine. Honest misses.',
    params: [
      { name: 'calculator', required: true, description: 'The design engine\'s title or a distinctive phrase from it (case-insensitive; partial names resolve when unambiguous).' },
    ],
  },

  // ── Filing strategy ──
  {
    id: 'filing-strategy.open-tab',
    surfaceId: 'filing-strategy',
    label: 'Open a filing-strategy tab',
    description:
      'On the filing-strategy workspace, switch between the filing-sequence, agency-divergence, and prediction-calibration tabs.',
    params: [
      { name: 'tab', required: true, description: 'The tab to open.', enum: ['sequence', 'divergence', 'calibration'] },
    ],
  },

  // ── Safety narratives ──
  {
    id: 'safety-narrative.select-case',
    surfaceId: 'safety-narrative',
    label: 'Open an SAE case',
    description:
      'On the safety-narrative workbench, open an SAE case from the worklist by its id or study id so its composed ICH E3 §16 narrative and reporting clock show — the same row click a person makes. Editing the narrative stays a human act. Resolved against the real worklist with honest misses; held while it loads.',
    params: [
      { name: 'case', required: true, description: 'The case id or its study id, as listed (case-insensitive; a distinctive partial resolves when unambiguous).' },
    ],
  },

  // ── FDA CRL library ──
  {
    id: 'crl-library.select-finding',
    surfaceId: 'crl-library',
    label: 'Open a CRL finding',
    description:
      'On the FDA CRL library, open a deficiency finding by its id so its detail shows — the same row click a person makes. Resolved against the real search results with honest misses; held while the search loads.',
    params: [
      { name: 'finding', required: true, description: 'The finding id as listed (case-insensitive).' },
    ],
  },

  // ── Registrations / lifecycle ──
  {
    id: 'registrations.open-tab',
    surfaceId: 'registrations',
    label: 'Open a registrations tab',
    description:
      'On the registrations workspace, switch between marketing authorizations, the approvals tracker, renewals & variations, HA commitments, and submission strategy.',
    params: [
      { name: 'tab', required: true, description: 'The tab to open.', enum: ['reg', 'clock', 'vary', 'commit', 'strategy'] },
    ],
  },

  // ── CRO portfolio ──
  {
    id: 'cro-portfolio.select-sponsor',
    surfaceId: 'cro-portfolio',
    label: 'Select a sponsor',
    description:
      'On the CRO portfolio, select a sponsor by name so its engagements show — the same row click a person makes. Resolved against the real roster with honest misses; held while it loads.',
    params: [
      { name: 'sponsor', required: true, description: 'The sponsor name as listed (case-insensitive; a distinctive partial resolves when unambiguous).' },
    ],
  },

  // ── Agency meetings ──
  {
    id: 'agency-meetings.select-meeting',
    surfaceId: 'agency-meetings',
    label: 'Open an agency meeting',
    description:
      'On the agency-meetings workspace, open a meeting by its id or a distinctive phrase (agency, type, or program) so its briefing book and minutes show — the same row click a person makes. Requesting or scheduling a meeting stays a governed human act. Honest misses; held while the list loads.',
    params: [
      { name: 'meeting', required: true, description: 'The meeting id, or a distinctive phrase from its agency / type / program (case-insensitive).' },
    ],
  },

  // ── Source tracer ──
  {
    id: 'source-tracer.select-section',
    surfaceId: 'source-tracer',
    label: 'Open a traced section',
    description:
      'On the source tracer, open an authored section by its id or a distinctive phrase from its title/document so its cited sources and their verification state show — the same row click a person makes. Resolved against the real sections with honest misses; held while they load.',
    params: [
      { name: 'section', required: true, description: 'The section id, or a distinctive phrase from its title or document (case-insensitive).' },
    ],
  },

  // ── Decision lineage ──
  {
    id: 'decision-lineage.select-graph',
    surfaceId: 'decision-lineage',
    label: 'Open a decision-lineage graph',
    description:
      'On the decision-lineage surface, open the lineage graph for a governed artifact by its label so its node-by-node derivation shows — the same row click a person makes. Resolved against the real graphs with honest misses; held while they load.',
    params: [
      { name: 'artifact', required: true, description: 'The artifact label as listed (case-insensitive; a distinctive partial resolves when unambiguous).' },
    ],
  },

  // ── Deep research ──
  {
    id: 'deep-research.open-tab',
    surfaceId: 'deep-research',
    label: 'Open a deep-research tab',
    description:
      'On the deep-research surface, switch between the research and connectors tabs. View-only: it never fills the research question, never picks sources or depth, and never launches research — launching spends metered research credits and stays a human click. Refused while the connector credential drawer is open or a credential save is in flight, and it will not switch away from a research run in progress.',
    params: [
      {
        name: 'tab',
        required: true,
        description: 'The tab to open.',
        enum: ['research', 'connectors'],
      },
    ],
  },
] as const;

const ACTIONS_BY_ID: ReadonlyMap<string, SurfaceActionTarget> = new Map(
  SURFACE_ACTIONS.map((a) => [a.id, a]),
);

/** Look up a surface action by id. */
export function findSurfaceAction(id: string): SurfaceActionTarget | undefined {
  return ACTIONS_BY_ID.get(id);
}

/** All action ids (for prompt/catalog injection and validation). */
export function surfaceActionIds(): string[] {
  return SURFACE_ACTIONS.map((a) => a.id);
}

/** The actions available on one screen (for discovery filtered to context). */
export function surfaceActionsForSurface(surfaceId: string): SurfaceActionTarget[] {
  return SURFACE_ACTIONS.filter((a) => a.surfaceId === surfaceId);
}

/**
 * Validate a requested surface action and produce the directive the client
 * bus performs, or a typed error. Mirrors `resolveNavigation` exactly: never
 * a directive for an unknown action, a governed verb, or invalid/missing
 * params — a wrong operation is worse than no operation.
 */
export function resolveSurfaceAction(
  actionId: string,
  params: Record<string, unknown> = {},
): SurfaceActionResolution {
  const action = ACTIONS_BY_ID.get(actionId);
  if (!action) {
    return {
      ok: false,
      code: 'unknown_action',
      error: `Unknown surface action "${actionId}".`,
      validActions: surfaceActionIds(),
    };
  }
  // Structural belt: the registry test refuses governed ids at build time; this
  // refuses them at runtime should an entry ever slip past review.
  if (GOVERNED_VERB_PATTERN.test(action.id)) {
    return {
      ok: false,
      code: 'governed_refused',
      error: `Surface action "${actionId}" names governed work and cannot be performed by AnA.`,
    };
  }
  if (!findNavigationTarget(action.surfaceId)) {
    return {
      ok: false,
      code: 'unknown_action',
      error: `Surface action "${actionId}" targets unknown surface "${action.surfaceId}".`,
    };
  }

  const outParams: Record<string, string> = {};
  for (const spec of action.params ?? []) {
    const raw = params[spec.name];
    if (raw === undefined || raw === null || raw === '') {
      if (spec.required) {
        return {
          ok: false,
          code: 'missing_param',
          error: `Action "${actionId}" requires param "${spec.name}".`,
        };
      }
      continue;
    }
    const value = String(raw);
    if (spec.enum && !spec.enum.includes(value)) {
      return {
        ok: false,
        code: 'invalid_param',
        error: `Param "${spec.name}" must be one of: ${spec.enum.join(', ')} (got "${value}").`,
      };
    }
    outParams[spec.name] = value;
  }

  return {
    ok: true,
    directive: {
      actionType: 'surface_action',
      actionId: action.id,
      surfaceId: action.surfaceId,
      label: action.label,
      ...(Object.keys(outParams).length > 0 ? { params: outParams } : {}),
    },
  };
}
