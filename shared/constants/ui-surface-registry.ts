/**
 * Global UI Surface Registry — the one map design installs against.
 *
 * Framework-agnostic, single source of truth that ties every installable UI
 * surface to the things a designer/frontend needs to wire it up *without*
 * spelunking the backend:
 *
 *   - the real app-shell key it renders under (`layoutMode`, from
 *     client/src/concept2cure/zen-app-constants.ts),
 *   - the design prototype it grows out of (`uiKit` → ui_kits/<dir>),
 *   - the real mounted REST prefixes it binds to (`apiPrefixes`, grounded in
 *     server/bootstrap/register-*-routes.ts — the authoritative mount table),
 *   - the AnA tool families it can surface (right-rail / slash-command),
 *   - the typed contract it imports for end-to-end typing (`sharedContract`),
 *   - the one-call discovery endpoint that returns nav + dynamic-form schema,
 *     when one exists (`discoveryCatalog`),
 *   - its install readiness and the compliance rails that gate it.
 *
 * This is the app-wide generalization of the two proven "UI-ready" precedents:
 *   - global-RI:  shared/constants/global-ri-ui.ts + shared/types/global-ri-api.ts
 *                 + GET /api/global-ri/catalog
 *   - submission: shared/types/submission-ui.ts (SUBMISSION_WORKSPACES) + submission-api.ts
 *
 * No React, no styling — components stay in the UI layer; this is the contract
 * they read. Import it on the client to drive global navigation and an install
 * tracker; import it on the server for parity checks.
 *
 * NOTE on apiPrefixes: these are the *primary* prefixes a surface binds to, not
 * an exhaustive route list. The authoritative full mount table is
 * server/bootstrap/register-*-routes.ts.
 */

import { GLOBAL_RI_GROUPS } from './global-ri-ui';
import { UI_V2_SURFACES } from './ui-surface-registry.ui-v2';

// ── Taxonomy ──────────────────────────────────────────────────────────────────

/** Left-rail tier (mirrors FEATURE_INVENTORY.md §7 "left-rail re-structure"). */
export type NavTier = 'global' | 'project' | 'specialist' | 'admin';

export const NAV_TIERS: NavTier[] = ['global', 'project', 'specialist', 'admin'];

/**
 * Install readiness — how much connective tissue already exists for the UI.
 *
 *  - `contract-ready`  typed @shared contract AND/OR a one-call discovery
 *                      catalog exist → nav + forms can be data-driven today.
 *                      (Highest leverage: install is "import the contract,
 *                      render from data".)
 *  - `routes-ready`    REST is mounted and tested; bind components directly to
 *                      the endpoints. A typed contract may be partial/absent.
 *  - `kit-only`        a design prototype exists but the backend binding map is
 *                      still being assembled.
 *  - `planned`         routes exist but the surface is not yet prioritized.
 */
export type ReadinessTier = 'contract-ready' | 'routes-ready' | 'kit-only' | 'planned';

export const READINESS_TIERS: ReadinessTier[] = [
  'contract-ready',
  'routes-ready',
  'kit-only',
  'planned',
];

/** A compliance rail (design skill) that gates a surface's UI. */
export type ComplianceRail =
  | 'regulatory-compliance-ux'
  | 'accessibility-enforcement'
  | 'microcopy-tone'
  | 'motion-discipline';

export interface UiSurface {
  /** Stable id (kebab-case). Unique across the registry. */
  id: string;
  /** Sentence-case display label. */
  label: string;
  /** Left-rail tier. */
  navTier: NavTier;
  /** Real app-shell key (zen-app-constants LayoutMode, or the ui-v2 shell's
      surface map under client/src/concept2cure/v2 for kit-added surfaces). */
  layoutMode: string;
  /** Lucide icon name (kit Icons.jsx vocabulary) used by the ui-v2 rail/⌘K. */
  icon?: string;
  /** Regulatory/domain grouping (free-form, used for nav sectioning + reporting). */
  group: string;
  /** Design prototype this surface grows from: ui_kits/<uiKit>, or null. */
  uiKit: string | null;
  /** Primary mounted REST prefixes (grounded in server/bootstrap/register-*). */
  apiPrefixes: string[];
  /** AnA tool name families this surface can surface (rail / slash / "ask AnA"). */
  anaToolFamilies: string[];
  /** Typed contract the UI imports for end-to-end typing (@shared/...), or null. */
  sharedContract: string | null;
  /** One-call discovery endpoint returning nav + dynamic-form schema, or null. */
  discoveryCatalog: string | null;
  /**
   * Install readiness. CUSTOMER-VISIBLE — this is not an internal planning note.
   *
   * The value is rendered verbatim to anyone who opens Codebase coverage: the
   * chip at client/src/concept2cure/v2/surfaces/Coverage.tsx:164 turns it into
   * "Kit-only" / "Routes-ready" / "Contract-ready" using the same four labels
   * READINESS_META declares (client/src/concept2cure/v2/registryModel.ts:318),
   * where `kit-only` reads on screen as "Design prototype exists; backend
   * binding map being assembled". `notes` below rides along on the same card
   * (Coverage.tsx:188) and on the scaffold heading (Surfaces.tsx:747), so a note
   * that still says "prototyped" makes the same claim in prose.
   *
   * It drifted, and in the direction that costs a regulated buyer the most
   * trust: nine surfaces still declared `kit-only` after their components had
   * been bound to live REST — labeling, risk, crl-library and pdev in this file,
   * plus nonclinical, clinical-ops, orphan, pediatric and lifecycle-mgmt in
   * ./ui-surface-registry.ui-v2.ts. Each of the nine fetches real tenant rows
   * and mutates through audited routes, and the product was telling the customer
   * they were prototypes.
   *
   * Nothing checks this field against the component that actually renders the
   * surface — the union above only constrains the spelling — so binding a
   * surface to REST, or unbinding one, means editing this in the same change.
   * The overstating direction is worse than the understating one: `routes-ready`
   * or `contract-ready` on a surface with no live binding is a capability claim,
   * not an apology.
   */
  readiness: ReadinessTier;
  /** Compliance rails that gate this surface. */
  compliance: ComplianceRail[];
  /**
   * PRODUCT COPY. This is rendered — as the scaffold page's subtitle under the
   * <h1>, as the Coverage card note, and as the nav card's tooltip — so it is
   * read by a regulatory director, not by an engineer. Write it as copy: no
   * API routes, no table names, no source paths, no branch names, and no
   * written-down counts of things the product computes (a count in prose goes
   * stale the moment the data grows, and then two screens disagree).
   *
   * `check-internals-in-copy.mjs` enforces this over both registry files.
   */
  notes?: string;
  /**
   * NOT RENDERED. Where the engineering detail that used to ride along inside
   * `notes` goes: bound routes, contract refs, the module that owns the write
   * layer. Kept rather than deleted — it was useful to the people maintaining
   * the surface; it was only ever wrong to put it on screen.
   */
  engineering?: string;
}

// Shorthand for the two near-universal rails.
const A11Y: ComplianceRail = 'accessibility-enforcement';
const TONE: ComplianceRail = 'microcopy-tone';
const PART11: ComplianceRail = 'regulatory-compliance-ux';

// ── The registry ──────────────────────────────────────────────────────────────
// Ordered by nav tier then dependency. Every entry is grounded in a real
// layoutMode + real mounted routes; readiness is reported honestly.

export const UI_SURFACES: UiSurface[] = [
  // ─── Tier: global ────────────────────────────────────────────────────────────
  {
    id: 'projects',
    label: 'Projects',
    navTier: 'global',
    layoutMode: 'projects',
    icon: 'folder',
    group: 'workspace',
    uiKit: 'home',
    apiPrefixes: ['/api/projects', '/api/programs'],
    anaToolFamilies: ['plan_submission'],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Entry to everything. Partially built in ui_kits/home and ui_kits/mdx.',
  },
  {
    id: 'apps',
    label: 'Apps catalog',
    navTier: 'global',
    layoutMode: 'apps',
    icon: 'grid',
    group: 'workspace',
    uiKit: null,
    apiPrefixes: ['/api/module-subscriptions'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Module catalog + entitlement-gated launch. Locked modules show upgrade CTA, not a dead button.',
  },
  {
    id: 'artifacts-center',
    label: 'Artifacts center',
    navTier: 'global',
    layoutMode: 'artifacts-center',
    icon: 'sparkles',
    group: 'evidence',
    uiKit: null,
    apiPrefixes: ['/api/biotech-artifacts', '/api/atoms', '/api/corpus'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, PART11],
    notes: 'Cross-project artifact library, version chain, provenance, signature status.',
  },

  // ─── Tier: project ───────────────────────────────────────────────────────────
  {
    id: 'project-home',
    label: 'Project home',
    navTier: 'project',
    layoutMode: 'project-home',
    icon: 'home',
    group: 'workspace',
    uiKit: 'mdx',
    apiPrefixes: ['/api/projects', '/api/programs', '/api/rim'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Readiness ring, tasks, milestones, RIM recs, change impact, governance, recent activity.',
  },
  {
    id: 'document-authoring',
    label: 'Document editor & authoring',
    navTier: 'project',
    layoutMode: 'editor',
    icon: 'penLine',
    group: 'authoring',
    uiKit: 'authoring',
    apiPrefixes: [
      '/api/document-authoring',
      '/api/authoring',
      '/api/authoring-actions',
      '/api/coauthor',
      '/api/workflow',
      '/api/esignature',
    ],
    anaToolFamilies: ['get_csr_template', 'get_nonclinical_template', 'draft_clinical_overview_m2_5'],
    sharedContract: '@shared/types/document-contract',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE, 'motion-discipline'],
    notes: 'Section editor with tracked changes, threaded comments, version history and diff, approval routing, and e-signature manifestation (21 CFR §11.50).',
    engineering: 'HANDOFF_TO_DESIGN_document_authoring.md is RETRACTED AS EVIDENCE (24 July 2026) and names its own section 2 as materially wrong about a live subsystem. It said this surface had backends but no UI; the surface is DocumentAuthoring.tsx, registered in surfaceViews and rendering every capability above. Do not re-cite that brief.',
  },
  {
    id: 'regulatory-workspace',
    label: 'Regulatory workspace',
    navTier: 'project',
    layoutMode: 'regulatory-workspace',
    icon: 'layoutPanels',
    group: 'authoring',
    uiKit: 'mdx',
    apiPrefixes: ['/api/document-authoring', '/api/project-sections'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/authoring-context',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Generic 3-pane shell (tree · canvas · intelligence). Substrate for documents/editor.',
  },
  {
    id: 'vault',
    label: 'Vault (DMS)',
    navTier: 'project',
    layoutMode: 'vault',
    icon: 'vault',
    group: 'evidence',
    uiKit: 'mdx',
    apiPrefixes: ['/api/c2c/project-vault', '/api/vault/ingest'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, PART11],
    notes: 'The program dossier tree (rule-pack builds) plus the filing cabinet: uploads are virus-scanned, SHA-256 hashed, auto-classified to a suggested dossier folder per the program\'s client-type taxonomy (CTD modules / device submission folders / TMF zones), and confirmed or moved via the governed, audited /file route. Includes the data room lane — every captured source with its derived captured→classified→filed stage.',
  },
  {
    id: 'review',
    label: 'Review & approval',
    navTier: 'project',
    layoutMode: 'review',
    icon: 'checkCircle',
    group: 'review',
    uiKit: 'mdx',
    apiPrefixes: ['/api/workflow', '/api/part11'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Review queue, threaded comments (open/resolved/outdated), reject-with-reason, e-sign manifestation (21 CFR §11.50).',
  },
  {
    id: 'submission-center',
    label: 'Submission center',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'rocket',
    group: 'submission',
    uiKit: 'submission',
    apiPrefixes: ['/api/submissions', '/api/submission-center', '/api/region-profiles'],
    anaToolFamilies: ['plan_submission', 'validate_submission'],
    sharedContract: '@shared/types/submission-ui',
    discoveryCatalog: 'SUBMISSION_WORKSPACES (shared/types/submission-ui.ts)',
    readiness: 'contract-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Package preview, eValidator pass, and the choice between an ESG submission and an eSTAR export.',
    engineering: 'Workspace map and error catalog live in shared, framework-agnostic. See SUBMISSION_CENTER_API.md.',
  },
  {
    id: 'submission-twin',
    label: 'Submission twin',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'layers',
    group: 'submission',
    uiKit: 'submission',
    apiPrefixes: ['/api/submission-twin'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/submission-ui',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Living submission intelligence — readiness/fragility, narrative-drift alerts, simulated reviewer challenges, change-impact, keyed on a numeric package id.',
    engineering: 'Routes: /api/submission-twin.',
  },
  {
    id: 'gateway-transmittals',
    label: 'Gateway transmittals',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'rocket',
    group: 'submission',
    uiKit: 'submission',
    apiPrefixes: ['/api/mdx'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Multi-region agency dispatch: gateway roster + credential status, governed transmit (§11 re-auth + reason), transmittal log, live status poll, ACK download, governed rollback.',
    engineering: 'Routes: /api/mdx/gateways.',
  },
  {
    id: 'ectd-coauthor',
    label: 'eCTD co-author',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'gitBranch',
    group: 'submission',
    uiKit: 'ectd_coauthor',
    apiPrefixes: ['/api/ectd', '/api/content-assembly'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/submission-api',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'eCTD tree + section authoring. Back-half pipeline (format→assemble→validate→transmit) is production-grade.',
  },
  {
    id: 'ectd-compile',
    label: 'Compile & Export eCTD',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'gitBranch',
    group: 'submission',
    uiKit: 'ectd_coauthor',
    apiPrefixes: ['/api/ectd-compile', '/api/ectd'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/submission-api',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'eCTD 4.0 backbone compile/validate/export across FDA/EMA, keyed on the program’s numeric project id.',
    engineering: 'Routes: /api/ectd-compile.',
  },
  {
    id: 'ectd-publishing',
    label: 'Publishing center',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'gitBranch',
    group: 'submission',
    uiKit: 'ectd_coauthor',
    apiPrefixes: ['/api/ectd'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/submission-api',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'eCTD publishing engine — version-aware (v3.2.2 + v4.0/HL7 RPS): controlled-vocabulary browser, RPS/backbone validation, v3->v4 forward-compat preview, and the exact spec versions each package is qualified against.',
    engineering: 'Routes: /api/ectd/controlled-vocab, /api/ectd/v4/*, /api/ectd/qualification.',
  },
  {
    id: 'device-510k',
    label: '510(k) workbench',
    navTier: 'project',
    layoutMode: 'section-workspace',
    icon: 'fileCheck',
    group: 'device',
    uiKit: 'mdx',
    apiPrefixes: ['/api/510k/estar', '/api/510k/device', '/api/cerv2', '/api/cerv2-sections', '/api/fda-forms'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/predicate-intelligence',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'eSTAR section tree · content editor · predicate/SE intelligence panel. In progress.',
  },
  {
    id: 'device-cer',
    label: 'CER generator (EU MDR)',
    navTier: 'project',
    layoutMode: 'section-workspace',
    icon: 'microscope',
    group: 'device',
    uiKit: null,
    apiPrefixes: ['/api/cer', '/api/cerv2'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Annex XIV structure, FAERS, literature, GSPR checklist, export. Dashboard only today.',
  },
  {
    id: 'cmc',
    label: 'CMC / Module 3',
    navTier: 'project',
    layoutMode: 'cmc',
    icon: 'beaker',
    group: 'quality-cmc',
    uiKit: 'cmc',
    apiPrefixes: ['/api/cmc', '/api/cmc/module3-os', '/api/cmc/specifications', '/api/cmc/stability'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes:
      'Module 3 operating system: registers, specifications, stability, batch records, build/compile, ' +
      'contradictions, Part 11 approval, export gate, and placement into the IND submission spine. ' +
      'Promoted to the rail (RAIL_SPECIALIST) 2026-08-23; entitlement-gated via the cmc catalog row.',
  },
  {
    id: 'ind-checklist',
    label: 'IND lifecycle',
    navTier: 'project',
    layoutMode: 'ind-checklist',
    icon: 'clipboardList',
    group: 'submission',
    uiKit: 'pdev',
    apiPrefixes: ['/api/ind-lifecycle', '/api/ind-forms', '/api/ind-master-data'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'IND checklist, forms (1571/1572/3674), master data, amendments, annual reports, safety reports.',
  },
  {
    id: 'pdev',
    label: 'Product development (PDEV → IND)',
    navTier: 'project',
    layoutMode: 'pdev',
    icon: 'workflow',
    group: 'submission',
    uiKit: 'pdev',
    apiPrefixes: ['/api/pdev'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    // routes-ready, not kit-only: the kit stopped being a prototype when
    // PdevSurfaces mounted it inside the shell. client/src/concept2cure/pdev/
    // App.tsx:100/152/153 call usePdevIndPrograms / usePdevProgram /
    // usePdevReadiness, which fetch /api/pdev/... (hooks/usePdevData.ts:133/
    // 183/244) from the router mounted at
    // server/bootstrap/register-regulatory-routes.ts:397, and the governed
    // mutations post a reason into the audit chain (usePdevData.ts:833/853).
    // No @shared contract and no discovery catalog, so routes-ready is the
    // ceiling here, not contract-ready.
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Activity → AI draft → evidence → confirm. State changes and evidence links carry a reason into the audit chain.',
    engineering: 'See PDEV_IND_DESIGN_BRIEF.md. Routes: /api/pdev.',
  },
  {
    id: 'template-library',
    label: 'Template library',
    navTier: 'project',
    layoutMode: 'template-library',
    icon: 'template',
    group: 'authoring',
    uiKit: null,
    apiPrefixes: ['/api/templates', '/api/c2c/templates'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Full REST (list/extract-preview/extract+save/create-from-spec/update/render docx|pdf), org-scoped, audited. No UI yet — strongest backend without a surface.',
  },
  {
    id: 'tasks',
    label: 'Tasks & collaboration',
    navTier: 'project',
    layoutMode: 'tasking',
    icon: 'checkSquare',
    group: 'collaboration',
    uiKit: 'tasking',
    apiPrefixes: ['/api/task-management', '/api/regulatory/tasks', '/api/project-sections'],
    anaToolFamilies: [],
    sharedContract: '@shared/schema',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, 'motion-discipline'],
    notes: 'Org-scoped unifiedTasks board (@shared/schema unifiedTasks · taskDependencies) + critical-path DAG, channels, messages, activity feed, presence, mentions, due dates. See ui_kits/tasking + ui_kits/task-tray.',
  },
  {
    id: 'dossier-map',
    label: 'Dossier map',
    navTier: 'project',
    layoutMode: 'dossier-map',
    icon: 'network',
    group: 'submission',
    uiKit: null,
    apiPrefixes: ['/api/rim', '/api/global-ri'],
    anaToolFamilies: ['global_ri_dossier'],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'CTD/eCTD module map with completeness + readiness overlay.',
  },
  {
    id: 'investigator-brochure',
    label: "Investigator's Brochure",
    navTier: 'project',
    layoutMode: 'investigator-brochure',
    icon: 'bookOpen',
    group: 'authoring',
    uiKit: null,
    apiPrefixes: ['/api/investigator-brochure'],
    anaToolFamilies: ['document_drafting'],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'ICH E6(R2) §7 IB section tree with per-section readiness over ib-builder.',
  },
  {
    id: 'csr-workflow',
    label: 'CSR workflow',
    navTier: 'project',
    layoutMode: 'csr-workflow',
    icon: 'fileText',
    group: 'clinical',
    uiKit: null,
    apiPrefixes: ['/api/csr', '/api/csr-builder'],
    anaToolFamilies: ['get_csr_template'],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'ICH E3 CSR builder + intelligence library.',
  },

  // ─── Tier: specialist ────────────────────────────────────────────────────────
  {
    id: 'global-ri',
    label: 'Global regulatory intelligence',
    navTier: 'specialist',
    layoutMode: 'intelligence',
    icon: 'globe',
    group: 'intelligence',
    uiKit: 'intelligence',
    apiPrefixes: ['/api/global-ri'],
    anaToolFamilies: ['global_ri_'],
    sharedContract: '@shared/types/global-ri-api',
    discoveryCatalog: 'GET /api/global-ri/catalog',
    readiness: 'contract-ready',
    compliance: [A11Y, TONE],
    notes: 'Deterministic regulatory capabilities, grouped by topic. The catalog drives both the navigation and the forms behind it.',
    engineering: 'One catalog call serves nav and dynamic forms. Capability and group counts are computed, never written down. See HANDOFF_TO_DESIGN_global_ri.md.',
  },
  {
    id: 'precedent-intelligence',
    label: 'Precedent intelligence',
    navTier: 'specialist',
    layoutMode: 'precedent-intelligence',
    icon: 'scale',
    group: 'intelligence',
    uiKit: 'intelligence',
    apiPrefixes: ['/api/precedent-engine', '/api/saved-precedent-queries'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/predicate-intelligence',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Past approvals search + decision rationale. Slots into 510(k) §12 substantial equivalence.',
  },
  {
    // The one new surface in the Clinical-Regulatory Intelligence Graph
    // workstream. `specialist` tier, beside precedent-intelligence, which it is
    // modelled on. (The design handoff proposed navTier:'biopharma' — that is a
    // client-type rail group, a different axis; see registryModel.NAV_GROUP_OF.)
    //
    // readiness was held at `kit-only` deliberately: the routes existed behind
    // ENABLE_CLINICAL_REGULATORY_GRAPH but the ingestion that gives them a
    // corpus was phase 4, and the note here said to promote to `routes-ready`
    // once phase 4 landed and the route tests passed. Both conditions are met —
    // the ingest route is server/routes/clinical-regulatory-evidence-routes.ts:410
    // and the tests are server/routes/__tests__/clinical-regulatory-evidence.test.ts
    // plus -ingest.test.ts — and the surface reads live: useLiveData at
    // client/src/concept2cure/v2/surfaces/CrlLibrary.tsx:292 against the router
    // mounted at server/bootstrap/register-clinical-intel-routes.ts:242. Promoted
    // as directed. The feature flag still gates the rail entry (Shell.tsx:288);
    // whether a surface is switched on is a different axis from whether its
    // backend binding exists, and only the second one is what this field states.
    id: 'crl-library',
    label: 'FDA CRL library',
    navTier: 'specialist',
    layoutMode: 'crl-library',
    icon: 'gavel',
    group: 'intelligence',
    uiKit: 'intelligence',
    apiPrefixes: ['/api/clinical-regulatory-evidence'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, PART11],
    notes:
      'Searchable view over the shared clinical-regulatory evidence graph — the same findings CSR workflow, study design and AnA read. Not a separate corpus, retrieval path or agent. Behind ENABLE_CLINICAL_REGULATORY_GRAPH.',
  },
  {
    id: 'biostatistics',
    label: 'Biostatistics',
    navTier: 'specialist',
    layoutMode: 'biostatistics',
    icon: 'sigma',
    group: 'clinical',
    uiKit: null,
    apiPrefixes: ['/api/biostat', '/api/ana-biostats'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'SAP authoring, power analysis, TLF shells, adaptive trial plans, IDMC.',
  },
  {
    id: 'biostat-workbench',
    label: 'Biostat workbench',
    navTier: 'specialist',
    layoutMode: 'biostatistics',
    icon: 'sigma',
    group: 'clinical',
    uiKit: null,
    apiPrefixes: ['/api/statistical-defensibility', '/api/biostat'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Real statistical engine: reviewer-risk defensibility assessment + design calculators (assurance), replacing the client-side normal approximation.',
  },
  // 'rbm-operations' is retired. It was a second, thinner RBM destination
  // holding the write/compute layer (KRI value capture, site-risk recompute,
  // central monitoring, patient scoring) while the `rbm` surface was read-only.
  // Those writes now live in the `rbm` shell itself, so keeping a peer nav entry
  // would offer two RBM destinations with one of them a strict subset.
  {
    id: 'report-engine',
    label: 'Report engine',
    navTier: 'specialist',
    layoutMode: 'report-engine',
    icon: 'barChart',
    group: 'evidence',
    uiKit: null,
    apiPrefixes: ['/api/haq-manager', '/api/intelligence'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/intelligence',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Immutable report records, cryptographic seal, and the provenance behind every figure.',
    engineering: 'See INSIGHTS_REPORTING_IMPLEMENTATION_SPEC.md.',
  },
  {
    id: 'safety-narrative',
    label: 'Safety narrative / PV',
    navTier: 'specialist',
    layoutMode: 'safety-narrative',
    icon: 'shieldAlert',
    group: 'safety-pv',
    uiKit: null,
    apiPrefixes: ['/api/pharmacovigilance'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'SAE narrative generation, ICSR, signal handling.',
  },
  {
    id: 'pv-cockpit',
    label: 'PV cockpit',
    navTier: 'specialist',
    layoutMode: 'safety-narrative',
    icon: 'shieldAlert',
    group: 'safety-pv',
    uiKit: null,
    apiPrefixes: ['/api/pharmacovigilance'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Safety-surveillance workbench: KPIs, disproportionality screener (PRR/ROR/EBGM), expedited-reporting clock, regional compliance matrix.',
    engineering: 'Routes: /api/pharmacovigilance.',
  },
  {
    id: 'device-diagnostics',
    label: 'Device & diagnostics workbench',
    navTier: 'specialist',
    layoutMode: 'device-diagnostics-workbench',
    icon: 'stethoscope',
    group: 'device',
    uiKit: 'risk',
    apiPrefixes: ['/api/mdx', '/api/manufacturing', '/api/ivdr'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Classification, performance testing, risk analysis, IVDR, CLIA, CDx, LDT. See ui_kits/risk + ui_kits/labeling.',
  },
  {
    id: 'labeling',
    label: 'Labeling',
    navTier: 'specialist',
    layoutMode: 'labeling',
    icon: 'tag',
    group: 'device',
    uiKit: 'labeling',
    apiPrefixes: ['/api/mdx'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    // routes-ready: useLiveRows('/api/mdx/labeling') at
    // client/src/concept2cure/v2/surfaces/Labeling.tsx:136, with symbols at :146
    // and translations at :155, and apiRequest POST/PATCH writing translations at
    // :199/:238 — against server/routes/mdx-labeling.ts:82/104/225/255. The kit
    // is the surface's origin, not its current state. sharedContract is still
    // null, so this stops at routes-ready.
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Labeling/IFU authoring and compliance. Documents, symbols and translations are read and written live — nothing is held only in the browser.',
    engineering: 'Routes: /api/mdx/labeling.',
  },
  {
    id: 'risk',
    label: 'Risk management',
    navTier: 'specialist',
    layoutMode: 'risk',
    icon: 'alertTriangle',
    group: 'device',
    uiKit: 'risk',
    apiPrefixes: ['/api/mdx', '/api/design-risk'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    // routes-ready: useLiveRows('/api/mdx/risk-items') at
    // client/src/concept2cure/v2/surfaces/Risk.tsx:152, with apiRequest creating
    // items, adding controls and changing status at :265/:298/:335 — against
    // server/routes/mdx-risk-management.ts:98/126/280/183. sharedContract is
    // still null, so this stops at routes-ready.
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'ISO 14971 risk file and hazard analysis. Risk items and their controls are read and written live — nothing is held only in the browser.',
    engineering: 'Routes: /api/mdx/risk-items.',
  },
  {
    id: 'deep-research',
    label: 'Deep research',
    navTier: 'specialist',
    layoutMode: 'deep-research',
    icon: 'telescope',
    group: 'intelligence',
    uiKit: null,
    apiPrefixes: ['/api/deep-research'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Long-running multi-source research (Opus). Shares the AnA rail in deep-research mode.',
  },

  // ─── Tier: admin ─────────────────────────────────────────────────────────────
  {
    id: 'setup',
    label: 'Admin / setup',
    navTier: 'admin',
    layoutMode: 'setup',
    icon: 'settings',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/setup', '/api/admin', '/api/users', '/api/enterprise/rbac', '/api/api-keys'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Org profile, users/roles, MFA policy, SSO/SCIM, module subscriptions, feature flags, API keys.',
  },
  {
    id: 'audit-trail',
    label: 'Audit trail',
    navTier: 'admin',
    layoutMode: 'audit',
    icon: 'scroll',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/admin/audit', '/api/part11'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Log entries, filters, signed PDF export. Immutable-history visual per regulatory-compliance-ux.',
  },
  {
    id: 'qmp',
    label: 'Quality management plans',
    navTier: 'admin',
    layoutMode: 'audit',
    icon: 'shieldCheck',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/quality'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Quality-management plan lifecycle (list/create/activate) + completeness/gate-level/risk-factor dashboard.',
    engineering: 'Routes: /api/quality.',
  },
  {
    id: 'part11-console',
    label: '21 CFR Part 11 console',
    navTier: 'admin',
    layoutMode: 'audit',
    icon: 'lock',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/part11'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Read-only compliance console: audit hash-chain integrity, §11.10 control status, SOC 2 control grid.',
    engineering: 'Routes: /api/part11.',
  },
  {
    id: 'identity-console',
    label: 'Enterprise identity (SSO / SCIM)',
    navTier: 'admin',
    layoutMode: 'audit',
    icon: 'lock',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/admin/scim-tenants', '/api/admin/scim-ip-allowlist', '/api/auth/sso'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'SCIM provisioning tokens (issue-once/rotate/enable/revoke, §11.10(d) hash-only storage), SCIM IP allowlist, and the live SAML endpoint references for IdP configuration.',
  },
  {
    id: 'report-governance',
    label: 'Report governance',
    navTier: 'admin',
    layoutMode: 'audit',
    icon: 'scroll',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/intelligent-reports'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Sealed-report lifecycle: list, cryptographic integrity verify, provenance/attestation counts, seal and revoke with justification.',
    engineering: 'Routes: /api/intelligent-reports.',
  },
  {
    id: 'billing',
    label: 'Billing',
    navTier: 'admin',
    layoutMode: 'billing',
    icon: 'creditCard',
    group: 'admin',
    uiKit: null,
    apiPrefixes: ['/api/billing/invoices', '/api/billing/budgets', '/api/billing/portal'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Usage, invoices, budgets, alerts. See MDX_PAYING_CUSTOMER_VALUE_AND_ENTITLEMENTS.',
  },
  {
    id: 'ana-memory',
    label: 'AnA Memory',
    navTier: 'global',
    layoutMode: 'ana-memory',
    icon: 'database',
    group: 'explore',
    uiKit: null,
    apiPrefixes: ['/api/mdx/ana/memory', '/api/mdx/ana/threads'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Browse/search knowledge atoms, pin/unpin, confidence scores.',
  },


  // ═══ ui-v2 kit reconciliation (2026-07-06) ═════════════════════════════════
  // The 48 kit-added surfaces live in ./ui-surface-registry.ui-v2.ts (split to
  // keep both files under the repo-health 1,500-line gate). Spread here so
  // UI_SURFACES stays the single canonical array every consumer imports.
  ...UI_V2_SURFACES,
];

// ── Cross-cutting concerns (not surfaces; every surface depends on these) ───────
//
// These are the providers/hooks design needs available app-wide BEFORE installing
// any surface. They are reported here so the install plan accounts for them once,
// not per-surface.

export interface CrossCuttingConcern {
  id: string;
  label: string;
  apiPrefixes: string[];
  sharedContract: string | null;
  /** PRODUCT COPY — rendered on the Coverage page. Same rule as UiSurface.notes. */
  notes: string;
  /** NOT RENDERED — engineering detail. Same rule as UiSurface.engineering. */
  engineering?: string;
}

export const CROSS_CUTTING_CONCERNS: CrossCuttingConcern[] = [
  {
    id: 'auth-session',
    label: 'Auth & session',
    apiPrefixes: ['/api/auth', '/api/users', '/api/auth/sso', '/api/auth/enterprise'],
    sharedContract: null,
    notes: 'JWT (sliding 7-day refresh), MFA (TOTP), SSO/SCIM. The session token and organization id travel on every request.',
    engineering: 'Token + org id flow through client/src/utils/authToken.ts and apiRequest headers.',
  },
  {
    id: 'tenant-org',
    label: 'Tenant / organization',
    apiPrefixes: ['/api/setup', '/api/enterprise'],
    sharedContract: null,
    notes: 'Org context via x-organization-id header + client/src/contexts/TenantContext. Multi-org picker.',
  },
  {
    id: 'feature-flags',
    label: 'Feature flags / entitlements',
    apiPrefixes: ['/api/module-subscriptions'],
    sharedContract: null,
    notes: 'Per-tenant module gating. A locked module shows an upgrade path, never a dead button.',
    engineering: 'client/src/flags/featureFlags.ts (isFeatureEnabled).',
  },
  {
    id: 'ana-rail',
    label: 'AnA assistant rail',
    apiPrefixes: ['/api/ana-ri', '/api/ana', '/api/chat'],
    sharedContract: '@shared/types/ai-actions',
    notes: 'Persistent right rail on every surface. Modes standard / deep-research / quick-ask, streamed as the answer is produced. Context card, suggested prompts, and "Ask AnA about this" chips. A pedigree badge says whether an answer is registry-grounded or needs verifying.',
    engineering: 'SSE via /api/ana-ri/stream.',
  },
  {
    id: 'esign-modal',
    label: 'E-signature modal',
    apiPrefixes: ['/api/esignature'],
    sharedContract: null,
    notes: 'Cross-cutting governed-action affordance (password re-verify + TOTP). 21 CFR §11.50 manifestation. Reused by review, submission, authoring.',
  },
];

// ── Selectors (pure; safe to import on client or server) ────────────────────────

const SURFACE_BY_ID: Record<string, UiSurface> = Object.fromEntries(
  UI_SURFACES.map((s) => [s.id, s])
);

/** Look up a surface by id, or undefined. */
export function getSurface(id: string): UiSurface | undefined {
  return SURFACE_BY_ID[id];
}

/** All surfaces in a nav tier, in registry order (use to build the left rail). */
export function surfacesByNavTier(tier: NavTier): UiSurface[] {
  return UI_SURFACES.filter((s) => s.navTier === tier);
}

/** Surfaces grouped by nav tier (ready for sectioned navigation). */
export function surfacesGroupedByNavTier(): Record<NavTier, UiSurface[]> {
  return {
    global: surfacesByNavTier('global'),
    project: surfacesByNavTier('project'),
    specialist: surfacesByNavTier('specialist'),
    admin: surfacesByNavTier('admin'),
  };
}

/** Surfaces at a given install readiness (use to drive an install tracker). */
export function surfacesByReadiness(tier: ReadinessTier): UiSurface[] {
  return UI_SURFACES.filter((s) => s.readiness === tier);
}

/** Count of surfaces per readiness tier (one-glance install progress). */
export function readinessSummary(): Record<ReadinessTier, number> {
  return READINESS_TIERS.reduce(
    (acc, tier) => {
      acc[tier] = surfacesByReadiness(tier).length;
      return acc;
    },
    {} as Record<ReadinessTier, number>
  );
}

/** Surfaces that expose a typed contract or a discovery catalog (highest leverage). */
export function contractReadySurfaces(): UiSurface[] {
  return UI_SURFACES.filter((s) => s.sharedContract !== null || s.discoveryCatalog !== null);
}

/**
 * The global-RI nav groups, re-exported so a client builds the global-RI
 * capability browser from the same source the backend uses. Avoids drift.
 */
export { GLOBAL_RI_GROUPS };
