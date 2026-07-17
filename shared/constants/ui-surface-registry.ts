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
  /** Install readiness. */
  readiness: ReadinessTier;
  /** Compliance rails that gate this surface. */
  compliance: ComplianceRail[];
  /** Short note: what's done, what design still owns. */
  notes?: string;
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
    label: 'Artifacts Center',
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
    notes: 'See HANDOFF_TO_DESIGN_document_authoring.md — editor + Yjs co-author + track-changes + comments + versions + approval + e-sign all have working backends, no UI.',
  },
  {
    id: 'regulatory-workspace',
    label: 'Regulatory workspace',
    navTier: 'project',
    layoutMode: 'regulatory-workspace',
    icon: 'layoutPanels',
    group: 'authoring',
    uiKit: 'mdx',
    apiPrefixes: ['/api/document-authoring', '/api/project-sections', '/api/ind-sections'],
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
    apiPrefixes: ['/api/corpus', '/api/device-data-center', '/api/evidence'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, PART11],
    notes: 'Drag-drop upload, chunking/embedding progress, semantic search, version history, evidence linking.',
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
    label: 'Submission Center',
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
    notes: 'Framework-agnostic workspace map + error catalog already in shared. Package preview, eValidator pass, ESG send vs eSTAR export picker. See SUBMISSION_CENTER_API.md.',
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
    id: 'device-510k',
    label: '510(k) workbench',
    navTier: 'project',
    layoutMode: 'section-workspace',
    icon: 'fileCheck',
    group: 'device',
    uiKit: 'mdx',
    apiPrefixes: ['/api/510k-workflow', '/api/cerv2', '/api/cerv2-sections', '/api/fda-forms'],
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
    notes: 'Module 3 operating system: blueprint, specifications, stability, batch records, convergence.',
  },
  {
    id: 'ind-checklist',
    label: 'IND lifecycle',
    navTier: 'project',
    layoutMode: 'ind-checklist',
    icon: 'clipboardList',
    group: 'submission',
    uiKit: 'pdev',
    apiPrefixes: ['/api/ind-lifecycle', '/api/ind-forms', '/api/ind-autodraft', '/api/ind-master-data'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'IND checklist, forms (1571/1572/3674), autodraft, master data, amendments, annual reports, safety reports.',
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
    readiness: 'kit-only',
    compliance: [PART11, A11Y, TONE],
    notes: 'See PDEV_IND_DESIGN_BRIEF.md. Activity → AI draft → evidence → confirm flow prototyped in ui_kits/pdev.',
  },
  {
    id: 'biopharma',
    label: 'Biopharma (BLA / CTD)',
    navTier: 'project',
    layoutMode: 'biopharma',
    icon: 'atom',
    group: 'submission',
    uiKit: 'biopharma',
    apiPrefixes: ['/api/biopharma', '/api/biopharma/bla', '/api/biopharma/ctd', '/api/biopharma/submissions'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'kit-only',
    compliance: [PART11, A11Y, TONE],
    notes: 'BLA workbench + CTD assembly. ui_kits/biopharma prototyped through Phase 10.',
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
    notes: 'Gold-standard pattern: ~41 deterministic capabilities, 9 groups, one-call catalog drives nav + dynamic forms. See HANDOFF_TO_DESIGN_global_ri.md.',
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
    notes: 'Immutable report records, cryptographic seal, provenance atoms. See INSIGHTS_REPORTING_IMPLEMENTATION_SPEC.md.',
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
    readiness: 'kit-only',
    compliance: [PART11, A11Y, TONE],
    notes: 'Labeling/IFU authoring + compliance. ui_kits/labeling prototyped.',
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
    readiness: 'kit-only',
    compliance: [PART11, A11Y, TONE],
    notes: 'ISO 14971 risk file, hazard analysis. ui_kits/risk prototyped.',
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
  notes: string;
}

export const CROSS_CUTTING_CONCERNS: CrossCuttingConcern[] = [
  {
    id: 'auth-session',
    label: 'Auth & session',
    apiPrefixes: ['/api/auth', '/api/users', '/api/auth/sso', '/api/auth/enterprise'],
    sharedContract: null,
    notes: 'JWT (sliding 7-day refresh), MFA (TOTP), SSO/SCIM. Token + org id flow through client/src/utils/authToken.ts and apiRequest headers.',
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
    notes: 'Per-tenant module gating. client/src/flags/featureFlags.ts (isFeatureEnabled). Locked modules → upgrade CTA, never a dead button.',
  },
  {
    id: 'ana-rail',
    label: 'AnA assistant rail',
    apiPrefixes: ['/api/ana-ri', '/api/ana', '/api/chat'],
    sharedContract: '@shared/types/ai-actions',
    notes: 'Persistent right rail on EVERY surface. Modes standard/deep-research/quick-ask. SSE via /api/ana-ri/stream. Context card + suggested prompts + "Ask AnA about this" chips. Pedigree badge (registry-grounded vs verify).',
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
