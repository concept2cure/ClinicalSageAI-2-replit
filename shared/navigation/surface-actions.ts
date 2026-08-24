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
 */
export const GOVERNED_VERB_PATTERN =
  /\b(sign|esign|e-sign|approve|reject|submit|transmit|lock|unlock|release|revoke|delete|destroy|certify|attest|countersign)\b/i;

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
