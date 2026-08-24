/**
 * AnA navigation contract — the single source of truth for "where in the app
 * can AnA send the user / itself, and how."
 *
 * WHY THIS EXISTS
 * The frontend can already APPLY a navigation directive: an AnA chat action with
 * a `path` flows through the streamed `executedActions` into the chat client,
 * which calls the app's navigate handler (resolving the path to a layoutMode /
 * surface). What was missing is the EMIT side + a governed catalog of where AnA
 * may go — this module supplies both as a UI-agnostic contract so AnA gains real
 * self-navigation without any screen being hard-coded twice.
 *
 * DESIGN
 * - Pure data + pure functions. No DB, no network, no React, no server deps — so
 *   both the server (AnA tools) and the client (the navigate handler) can import
 *   it as the one place that defines valid destinations.
 * - `resolveNavigation` validates a requested target + params against the
 *   registry and returns a `NavigationDirective` in the exact shape the chat
 *   client's action handler consumes (`{ path, params, label }`), or a typed
 *   error — never a half-formed jump to a screen that does not exist.
 *
 * STABILITY NOTE (UI still being built by Claude Design)
 * The TARGET LIST below is seeded from the navigation model that exists today
 * (client/src/concept2cure/zen-app-constants.ts `LayoutMode` + the ZenApp
 * surface resolver). It is the contract's *data*, expected to be reconciled with
 * the final routes as surfaces land — the TYPES and resolver are stable. Keep
 * this list and the frontend's layoutMode/nav constants in lock-step (see
 * navigation.test.ts, which guards the shape).
 */

/** A project target needs an active project; a global target does not. */
export type NavigationScope = 'global' | 'project';

export interface NavigationParamSpec {
  /** Param key passed alongside the directive (e.g. "intelligenceTab"). */
  name: string;
  required: boolean;
  description: string;
  /** Allowed values, when the param is an enum. */
  enum?: string[];
}

export interface NavigationTarget {
  /** Canonical id AnA references and the client resolves (mirrors a layoutMode/nav id). */
  id: string;
  /** Human-readable name for the destination. */
  label: string;
  /** What the screen is and when AnA should navigate there. */
  description: string;
  /** 'project' targets require an active project in context; 'global' do not. */
  scope: NavigationScope;
  /** Logical grouping (module/area) for discovery. */
  group: string;
  /**
   * The token the chat client applies as `action.path`. Defaults to `id`; set
   * explicitly only when the client path differs from the canonical id.
   */
  path?: string;
  /** Optional params the destination accepts (e.g. a sub-tab). */
  params?: NavigationParamSpec[];
}

/** The validated directive emitted to the client (matches the action-chip shape). */
export interface NavigationDirective {
  actionType: 'navigate';
  targetId: string;
  label: string;
  /** The path the client navigates to (== target.path ?? target.id). */
  path: string;
  scope: NavigationScope;
  params?: Record<string, string>;
}

export type NavigationResolution =
  | { ok: true; directive: NavigationDirective }
  | {
      ok: false;
      code: 'unknown_target' | 'missing_param' | 'invalid_param';
      error: string;
      validTargets?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY — seeded from the live navigation model. Single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export const NAVIGATION_TARGETS: readonly NavigationTarget[] = [
  // ── Global destinations (no active project required) ──
  { id: 'projects', label: 'Projects', description: 'The projects list / workspace home — pick or create a regulatory program.', scope: 'global', group: 'global' },
  { id: 'mdx', label: 'MDX (Medical Device & Diagnostics)', description: 'The MDX module home (510(k), PMA, CER, IVD surfaces).', scope: 'global', group: 'global' },
  { id: 'biopharma', label: 'Biopharma', description: 'The biopharma module (IND, pathway, lifecycle, meetings).', scope: 'global', group: 'global' },
  { id: 'pdev', label: 'Program Development (PDEV→IND)', description: 'The PDEV → IND workflow surface. May be feature-gated.', scope: 'global', group: 'global' },
  { id: 'deep-research', label: 'Deep Research', description: 'The full-screen deep-research chat surface.', scope: 'global', group: 'global' },
  { id: 'apps', label: 'Apps', description: 'The specialist-tools launcher (precedent intelligence, biostatistics, report engine, etc.).', scope: 'global', group: 'global' },
  {
    id: 'artifacts-center', label: 'Artifacts Center', description: 'The cross-project artifacts center.', scope: 'global', group: 'global',
    // Declared because it is already CONSUMED (the surface focuses/scrolls to
    // this artifact on mount) and PRODUCED (the shell's follow-the-work stash
    // on artifact_version_saved) — an undeclared param the channel carries is
    // a contract gap, not a feature.
    params: [{ name: 'artifactId', required: false, description: 'Artifact to focus and scroll into view on arrival.' }],
  },

  // ── Project-scoped tabs (require an active project) ──
  { id: 'project-home', label: 'Project Home', description: 'The active project overview / home.', scope: 'project', group: 'project' },
  { id: 'regulatory-workspace', label: 'Regulatory Workspace', description: 'The canonical project workspace (AnA + canvas).', scope: 'project', group: 'project' },
  { id: 'documents', label: 'Documents', description: 'The project document list.', scope: 'project', group: 'project' },
  { id: 'review', label: 'Review', description: 'The review / readiness surface for the project.', scope: 'project', group: 'project' },
  { id: 'submissions', label: 'Submissions', description: 'The project submissions surface.', scope: 'project', group: 'project' },
  { id: 'vault', label: 'Vault', description: 'The project document vault.', scope: 'project', group: 'project' },
  { id: 'dossier-map', label: 'Dossier Map', description: 'The CTD/dossier structure map for the project.', scope: 'project', group: 'project' },
  { id: 'section-workspace', label: 'Section Workspace', description: 'The CTD section authoring workspace.', scope: 'project', group: 'project', params: [{ name: 'sectionCode', required: false, description: 'CTD section code to open, e.g. "3.2.P.8".' }] },
  { id: 'csr-workflow', label: 'CSR Workflow', description: 'The clinical study report workflow.', scope: 'project', group: 'project' },
  { id: 'ind-checklist', label: 'IND Checklist', description: 'The IND submission checklist.', scope: 'project', group: 'project' },
  { id: 'template-library', label: 'Template Library', description: 'The project template library.', scope: 'project', group: 'project' },
  { id: 'review-readiness', label: 'Review Readiness', description: 'The submission review-readiness assessment.', scope: 'project', group: 'project' },
  { id: 'report-engine', label: 'Report Engine', description: 'The reporting / analytics report engine.', scope: 'project', group: 'project' },

  // ── Module workstreams (project-scoped) ──
  { id: 'cmc', label: 'CMC / Quality (Module 3)', description: 'The CMC workstream (specifications, stability, batch, etc.).', scope: 'project', group: 'module' },
  { id: 'labeling', label: 'Labeling', description: 'The labeling workstream (documents, symbols, translations).', scope: 'project', group: 'module' },
  { id: 'risk', label: 'Risk Management', description: 'The risk workstream (register, matrix, controls).', scope: 'project', group: 'module' },
  { id: 'tasking', label: 'Tasking', description: 'The task board / list / kanban.', scope: 'project', group: 'module' },
  { id: 'submission-gateway', label: 'Submission Gateway', description: 'The submission gateway (transmittals, validation).', scope: 'project', group: 'module' },
  {
    id: 'intelligence', label: 'Intelligence', description: 'The intelligence surface (protocol, CMC, biostat, reports tabs).', scope: 'project', group: 'module',
    params: [{
      name: 'intelligenceTab',
      required: false,
      description: 'Which intelligence catalog group to open.',
      // The REAL group ids the destination renders (shared/constants/global-ri-ui).
      // The original values ('protocol','cmc','biostat','reports') predated the
      // catalog and mostly matched nothing — a declared enum that promises tabs
      // the screen does not have is the drift this list replaces.
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
    }],
  },
  { id: 'quality', label: 'Quality (SOP / Controlled Docs)', description: 'The quality management surface (SOP register, controlled documents).', scope: 'project', group: 'module' },
  {
    id: 'authoring', label: 'Authoring', description: 'The unified document authoring editor.', scope: 'project', group: 'module',
    params: [{ name: 'authoringDocType', required: false, description: 'Document type to author (drives the editor template).' }],
  },
  { id: 'ectd-coauthor', label: 'eCTD Co-Author', description: 'The eCTD co-authoring surface.', scope: 'project', group: 'module' },

  // ── Capability surfaces pending a design (see docs/ANA_SURFACE_MAP.md) ──
  // Registered so AnA can route to them as soon as the screens are built. Until
  // then the underlying tools (PV / HEOR) are still reachable from chat.
  { id: 'safety', label: 'Safety / Pharmacovigilance', description: 'The safety/PV workspace — SAE line listings, E2B(R3) ICSR composition, and PV deliverables for the project.', scope: 'project', group: 'module' },
  { id: 'market-access', label: 'Market Access / HEOR', description: 'The health-economics & market-access workspace — budget-impact, cost-effectiveness (ICER), Markov, and PSA modeling for payer dossiers.', scope: 'project', group: 'module' },
] as const;

const TARGETS_BY_ID: ReadonlyMap<string, NavigationTarget> = new Map(
  NAVIGATION_TARGETS.map((t) => [t.id, t]),
);

/** Look up a navigation target by id. */
export function findNavigationTarget(id: string): NavigationTarget | undefined {
  return TARGETS_BY_ID.get(id);
}

/** All navigable target ids (e.g. for prompt/catalog injection or validation). */
export function navigationTargetIds(): string[] {
  return NAVIGATION_TARGETS.map((t) => t.id);
}

/**
 * Validate a requested navigation and produce the directive the chat client
 * applies, or a typed error. Never returns a directive for an unknown target or
 * with an invalid/missing required param — a bad jump is worse than no jump.
 */
export function resolveNavigation(
  targetId: string,
  params: Record<string, unknown> = {},
): NavigationResolution {
  const target = TARGETS_BY_ID.get(targetId);
  if (!target) {
    return {
      ok: false,
      code: 'unknown_target',
      error: `Unknown navigation target "${targetId}".`,
      validTargets: navigationTargetIds(),
    };
  }

  const outParams: Record<string, string> = {};
  for (const spec of target.params ?? []) {
    const raw = params[spec.name];
    if (raw === undefined || raw === null || raw === '') {
      if (spec.required) {
        return { ok: false, code: 'missing_param', error: `Target "${targetId}" requires param "${spec.name}".` };
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
      actionType: 'navigate',
      targetId: target.id,
      label: target.label,
      path: target.path ?? target.id,
      scope: target.scope,
      ...(Object.keys(outParams).length > 0 ? { params: outParams } : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL PARSER — for the (deferred) stream wiring. Pure; safe to ship now.
//
// AnA emits a fenced ```ana-navigate JSON block ({ "target": "...", "params": {…} })
// in its response. This extracts and resolves each into a directive. The live
// hookup (calling this in post-processing.ts and pushing the directives into the
// streamed executedActions) is the remaining wiring step once the UI is final —
// see shared/navigation/README.md.
// ─────────────────────────────────────────────────────────────────────────────

const NAVIGATE_BLOCK = /```ana-navigate\s*\n([\s\S]*?)\n```/g;
const MAX_NAVIGATE_SIGNALS = 5;

export interface ParsedNavigation {
  directives: NavigationDirective[];
  /** Resolution errors for malformed/invalid blocks (logged, not applied). */
  errors: string[];
}

/** Extract and resolve all ana-navigate blocks from AnA's response text. */
export function parseNavigationSignals(text: string): ParsedNavigation {
  const directives: NavigationDirective[] = [];
  const errors: string[] = [];
  if (!text) return { directives, errors };

  let match: RegExpExecArray | null;
  NAVIGATE_BLOCK.lastIndex = 0;
  while ((match = NAVIGATE_BLOCK.exec(text)) !== null) {
    if (directives.length + errors.length >= MAX_NAVIGATE_SIGNALS) break;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      errors.push('Malformed ana-navigate block (invalid JSON).');
      continue;
    }
    const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    const targetId = typeof obj.target === 'string' ? obj.target : '';
    const params = obj.params && typeof obj.params === 'object' ? (obj.params as Record<string, unknown>) : {};
    const res = resolveNavigation(targetId, params);
    if (res.ok) directives.push(res.directive);
    else errors.push(res.error);
  }
  return { directives, errors };
}
