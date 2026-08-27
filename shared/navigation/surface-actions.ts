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
 * structural exclusion as a signature) joined with wave 4.
 */
export const GOVERNED_VERB_PATTERN =
  /\b(sign|esign|e-sign|approve|reject|submit|transmit|lock|unlock|release|revoke|delete|destroy|certify|attest|countersign|freeze|dispatch|accept|advance|launch)\b/i;

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
      'On the CMC workstream, open one of its tabs: overview, substance & product (materials), specifications (specs), stability, batch records (batch), change control (change), quality by design (quality), Module 3 build (build), or program records (pathway). Switching tabs replaces the current pane — do it when asked or when beginning work there, not while the user is mid-form in the current pane.',
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
