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
  { id: 'nda-cockpit', label: 'NDA/BLA cockpit', description: 'The NDA/BLA marketing-application cockpit — CTD readiness, Module 1 admin, the PDUFA clock, Refuse-to-File risk, and biologics.', scope: 'project', group: 'module' },
  { id: 'maa-cockpit', label: 'MAA cockpit', description: 'The EU MAA marketing-application cockpit.', scope: 'project', group: 'module' },
  { id: 'haq-manager', label: 'Health-authority questions', description: 'The HAQ manager — agency questions grouped by round, with analysis, drafts and commitments.', scope: 'project', group: 'module' },
  { id: 'mission-control', label: 'Mission control', description: 'The portfolio mission-control board — every program and its cross-program status.', scope: 'global', group: 'global' },
  { id: 'biostat-workbench', label: 'Biostatistics workbench', description: 'The biostatistics workbench — reviewer-risk assessment plus the deterministic design engines (assurance, group-sequential, sample size, multiplicity, and more).', scope: 'global', group: 'module' },
  { id: 'filing-strategy', label: 'Filing strategy', description: 'The filing-strategy workspace — filing-sequence optimization, agency divergence, and prediction calibration.', scope: 'project', group: 'module' },
  { id: 'safety-narrative', label: 'Safety narratives', description: 'The safety-narrative workbench — the SAE case worklist with the ICH E3 §16 narrative composer and expedited-reporting clocks.', scope: 'project', group: 'module' },
  { id: 'crl-library', label: 'FDA CRL library', description: 'The FDA Complete-Response-Letter evidence library — deficiency findings by discipline and severity across the corpus.', scope: 'global', group: 'module' },
  { id: 'registrations', label: 'Registrations', description: 'The registrations & lifecycle workspace — marketing authorizations by market, the approvals tracker, renewals & variations, HA commitments, and submission strategy.', scope: 'project', group: 'module' },
  { id: 'cro-portfolio', label: 'CRO portfolio', description: 'The CRO sponsor portfolio — the org’s sponsor roster and their program engagements.', scope: 'global', group: 'module' },
  { id: 'agency-meetings', label: 'Agency meetings', description: 'The agency-meetings workspace — Type A/B/C and scientific-advice meetings with briefing books and minutes.', scope: 'global', group: 'module' },
  { id: 'source-tracer', label: 'Source tracer', description: 'The source-tracer — every authored section with where each sentence came from: the cited sources and their verification state.', scope: 'global', group: 'module' },
  { id: 'decision-lineage', label: 'Decision lineage', description: 'The decision-lineage graph — how a governed artifact was reached, node by node, with live hash-chain integrity.', scope: 'global', group: 'module' },

  // ── Device & diagnostics workstream (all render via MdxSurfaceHost; program
  // scope comes from the project in context when one is open) ──
  { id: 'device-workstream', label: 'Device portfolio', description: 'The device portfolio overview — program cards and portfolio health KPIs.', scope: 'global', group: 'module' },
  { id: 'device-510k', label: '510(k) pathway', description: 'The 510(k) pathway workspace — predicate intelligence, the substantial-equivalence matrix, and eSTAR sections.', scope: 'global', group: 'module' },
  { id: 'device-pma', label: 'PMA pathway', description: 'The PMA pathway workspace — premarket-approval modules for the program in context.', scope: 'global', group: 'module' },
  { id: 'device-cer', label: 'Clinical Evaluation Report', description: 'The CER pathway workspace for clinical evaluation under EU MDR.', scope: 'global', group: 'module' },
  { id: 'device-diagnostics', label: 'IVD pathway', description: 'The IVD pathway workspace for in-vitro diagnostic programs.', scope: 'global', group: 'module' },
  { id: 'device-clinical-studies', label: 'Device clinical studies', description: 'The clinical studies register for device programs.', scope: 'global', group: 'module' },
  { id: 'device-software', label: 'Device software lifecycle', description: 'Software documentation completeness for the device program in context.', scope: 'global', group: 'module' },
  { id: 'device-engineering', label: 'Device engineering', description: 'The engineering and design-controls workspace.', scope: 'global', group: 'module' },
  { id: 'device-udi', label: 'UDI and labeling', description: 'The device UDI register.', scope: 'global', group: 'module' },
  { id: 'device-postmarket', label: 'Post-market vigilance', description: 'Postmarket surveillance with its triage queue.', scope: 'global', group: 'module' },
  { id: 'device-presub', label: 'Pre-Sub manager', description: 'The device pre-submission manager.', scope: 'global', group: 'module' },
  { id: 'device-vault', label: 'Device vault', description: 'Device vault artifacts with versions and audit.', scope: 'global', group: 'module' },
  { id: 'device-tasks', label: 'Device tasks', description: 'The device task workbench.', scope: 'global', group: 'module' },
  { id: 'device-validation', label: 'Validation center', description: 'The device validation workbench.', scope: 'global', group: 'module' },
  { id: 'device-submission', label: 'Device submissions', description: 'The device submission-packages workbench.', scope: 'global', group: 'module' },
  { id: 'device-analytics', label: 'Device analytics', description: 'Device analytics panels.', scope: 'global', group: 'module' },

  // ── Pharmaceutical development (the PDEV kit; `pdev` itself is above) ──
  { id: 'pdev-cmc', label: 'PDEV CMC workstream', description: 'The CMC workstream of the PDEV → IND program.', scope: 'global', group: 'module' },
  { id: 'pdev-nonclinical', label: 'PDEV nonclinical workstream', description: 'The nonclinical workstream of the PDEV → IND program.', scope: 'global', group: 'module' },
  { id: 'pdev-clinical', label: 'PDEV clinical workstream', description: 'The clinical workstream of the PDEV → IND program.', scope: 'global', group: 'module' },
  { id: 'pdev-regulatory', label: 'PDEV regulatory workstream', description: 'The regulatory workstream of the PDEV → IND program.', scope: 'global', group: 'module' },
  { id: 'pdev-ind-assembly', label: 'IND assembly readiness', description: 'IND assembly readiness — per-module document presence against the compile threshold.', scope: 'global', group: 'module' },
  { id: 'pdev-contradictions', label: 'PDEV contradictions registry', description: 'Cross-artifact contradictions for the PDEV program, with promotion-blocking authority states.', scope: 'global', group: 'module' },
  { id: 'pdev-fda-interactions', label: 'FDA interactions', description: 'The PDEV FDA interaction stream and proposals.', scope: 'global', group: 'module' },

  // ── Analysis & authoring tools ──
  { id: 'batch-draft', label: 'Batch draft', description: 'Parallel section drafting over the eCTD Co-Author document spine (running a batch stays a human click).', scope: 'global', group: 'module' },
  { id: 'biostatistics', label: 'Biostatistics designer', description: 'The deterministic biostatistics design engine — sample size, power, and governed statistical documents.', scope: 'global', group: 'module' },
  { id: 'change-assessment', label: 'Change assessment', description: 'The 510(k)-change / MDR significant-change worklist with FDA and EU determinations.', scope: 'global', group: 'module' },
  { id: 'doc-journey', label: 'Document journey', description: 'A document’s lifecycle rail — the read-only reconstruction of its real audit trail.', scope: 'global', group: 'module' },
  { id: 'ectd-publishing', label: 'eCTD publishing reference', description: 'Spec versions and controlled vocabularies — read-only; nothing here publishes, transmits, or freezes a sequence.', scope: 'global', group: 'module' },
  { id: 'inconsistency', label: 'Inconsistency board', description: 'The cross-document inconsistency submission gate for the project in context (fails closed).', scope: 'project', group: 'module' },
  { id: 'intelligence-catalog', label: 'Capability catalog', description: 'The catalog of AnA’s deterministic tools, filterable by name.', scope: 'global', group: 'module' },
  { id: 'labeling-pi', label: 'Prescribing information', description: 'The USPI / EU SmPC / SPL labeling workspace.', scope: 'global', group: 'module' },
  { id: 'precedent-intelligence', label: 'Precedent intelligence', description: 'The precedent search board — clearances, cycles, and risk analysis (runs only when a person searches).', scope: 'global', group: 'module' },
  { id: 'program-journey', label: 'Program journey', description: 'The end-to-end program arc — nine stages with readiness and blockers.', scope: 'global', group: 'module' },
  { id: 'pyramid', label: 'Submission pyramid', description: 'The submission work-breakdown pyramid — phases, tasks and critical path per submission type.', scope: 'global', group: 'module' },
  { id: 'authoring-engine', label: 'Authoring engine', description: 'What the authoring engine is built to do per document type — capability reference, no program data.', scope: 'global', group: 'module' },
  { id: 'orchestration', label: 'Orchestration', description: 'Workflow runs, human-in-the-loop approval gates, and dispatch readiness.', scope: 'global', group: 'module' },
  { id: 'report-governance', label: 'Report governance', description: 'The sealed-report lifecycle — integrity verification, provenance, seal and revoke ceremonies.', scope: 'global', group: 'module' },
  { id: 'research-admin', label: 'Research administration', description: 'Research administration — the CITI training matrix (other sections connect later).', scope: 'global', group: 'module' },

  // ── Administration & platform ──
  { id: 'admin-console', label: 'Admin & access', description: 'Organization administration — members, roles, SSO, API keys, and settings.', scope: 'global', group: 'global' },
  { id: 'access-requests', label: 'Access requests', description: 'The organization’s module access-request queue.', scope: 'global', group: 'global' },
  { id: 'licensing', label: 'Plans & licensing', description: 'The organization’s current plan and the pricing catalog.', scope: 'global', group: 'global' },
  { id: 'master-licensing', label: 'Master licensing', description: 'Platform-owner licensing control — packaging, tenants, flags, enforcement.', scope: 'global', group: 'global' },
  { id: 'identity-console', label: 'Enterprise identity', description: 'SCIM provisioning tokens, the IdP allowlist, and SAML endpoints (platform administrators).', scope: 'global', group: 'global' },
  { id: 'onboarding', label: 'Workspace setup', description: 'The workspace setup wizard — nothing is created until Activate.', scope: 'global', group: 'global' },
  { id: 'onboarding-ingest', label: 'Set up from a document', description: 'Upload a document; AnA proposes provenance-verified values; a human reviews and applies.', scope: 'global', group: 'global' },
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
