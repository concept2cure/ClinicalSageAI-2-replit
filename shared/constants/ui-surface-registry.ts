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
import { deferredSurfaceDescription } from './deferred-capability-inventory';
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
    // 2026-09-29: '/api/programs' removed: every route under it is the device
    // 510(k) app's predicate intelligence, SE render or RTM, and Projects calls
    // none of them (docs/evidence/D2-API-SCOPE/2026-09-29-programs-claim/).
    // 2026-10-29: '/api/c2c/projects' added. It is the project record: the
    // Projects list and New project (GET and POST /), and Project home's
    // /:id, dossier, team, activity, records and sources. Only
    // submission-center and ivd-completeness claimed it, both standard tier,
    // so under MODULE_ENFORCEMENT=enforce an organization holding Projects
    // (free tier) but neither of those was refused its own projects. They
    // keep their claims; the gate serves a holder of any claimant, so nobody
    // loses access (docs/evidence/D2-ONE-ANA/2026-10-29/core-project-record-gating/).
    apiPrefixes: ['/api/projects', '/api/c2c/projects'],
    anaToolFamilies: ['plan_submission'],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Entry to everything. Partially built in ui_kits/home and ui_kits/mdx.',
  },
  {
    id: 'apps',
    label: 'Subscription & features',
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
    notes: 'What the organization’s subscription includes and why any feature is unavailable; administrators turn features on and off. A locked feature says why, and what opens it.',
  },
  // No artifacts-center. The Artifacts center folded into the Vault as its
  // organization view (D2, fold F3 slice C, 2026-10-29); 'artifacts-center' is a
  // DEEP_LINK_ALIASES entry for 'vault', and /api/artifacts-center is the Vault's
  // claim alone. Its other claim, /api/atoms, had no route and no caller.

  // ─── Tier: project ───────────────────────────────────────────────────────────
  {
    id: 'project-home',
    label: 'Project home',
    navTier: 'project',
    layoutMode: 'project-home',
    icon: 'home',
    group: 'workspace',
    uiKit: 'mdx',
    // Launch-scope API (2026-09-25, ci:launch-scope-api): ProjectHome reads and generates the schedule of events.
    // 2026-09-29: '/api/rim' removed: ProjectHome does not call it; it is the
    // hidden Registrations app's API.
    // 2026-09-29: '/api/programs' removed for the same reason as on Projects.
    apiPrefixes: ['/api/projects', '/api/concept2cure/projects'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'Readiness ring, tasks, milestones, RIM recs, change impact, governance, recent activity.',
  },
  {
    id: 'document-authoring',
    label: 'The editor',
    navTier: 'project',
    layoutMode: 'editor',
    icon: 'penLine',
    group: 'authoring',
    uiKit: 'authoring',
    // Launch-scope API (2026-09-25, ci:launch-scope-api): useFilingOutline.ts reads the filing outline.
    // Launch-scope API (2026-09-25, ci:launch-scope-api): authoring reads data origins, holds collaborative locks, and assigns review tasks.
    // Narrowed 2026-10-22 to what a launch screen or app uses (D2-API-SCOPE/2026-10-15-reproof/api-scope/).
    apiPrefixes: [
      '/api/document-authoring',
      '/api/authoring',
      '/api/authoring-actions/decision-context',
      '/api/authoring-actions/decisions',
      '/api/authoring-actions/module-preflight',
      '/api/coauthor/documents',
      '/api/esignature',
      '/api/c2c/documents',
      '/api/data-origins',
      '/api/realtime-collab/locks',
      '/api/realtime-collab/rooms',
      '/api/tasks/messages',
      '/api/tasks/my-work',
      '/api/tasks/tasks',
      '/api/tasks/templates',
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
    // Launch-scope API (2026-09-25, ci:launch-scope-api): BiopharmaProject.tsx reads these two.
    // Launch-scope API (2026-09-25, ci:launch-scope-api): the regulatory workspace reads its tree and the CSR board.
    apiPrefixes: ['/api/document-authoring', '/api/project-sections', '/api/clinical-regulatory-evidence/findings', '/api/clinical-regulatory-evidence/outcome', '/api/regulatory-workspace', '/api/csr-workflow'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/authoring-context',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: deferredSurfaceDescription('regulatory-workspace'),
  },
  {
    id: 'vault',
    label: 'Vault',
    navTier: 'project',
    layoutMode: 'vault',
    icon: 'vault',
    group: 'evidence',
    uiKit: 'mdx',
    // Launch-scope API (2026-09-25, ci:launch-scope-api): MdxSurfaceHost (useMdxPrograms, useWorkbench, useSubmissions) calls these for the Vault too.
    // '/api/mdx/vault' was claimed here on 2026-09-26 for mdx/hooks/useVault.ts. That attribution
    // was a walker bug (fixed in f9eee2670): useVault renders only in the device kit's device-vault
    // surface, outside the catalog. The launch Vault reads the same stores through
    // /api/c2c/project-vault. Unclaimed 2026-10-22.
    // '/api/vault/legal-holds' (2026-10-01, P1-22; ADR-0014 §6): the legal-hold list, place and lift
    // (server/routes/vault-legal-holds.ts). LegalHoldsCard calls them from Admin and access →
    // Settings (Setup's, until it folded in, D2 2026-10-29), so admin-console claims them too;
    // Vault retains the preservation API family for its records. Its /retention sub-path is
    // admin-console's alone.
    // /api/regulatory/documents: a Vault version's review and approval, on the
    // one document lifecycle (VR-13).
    // Narrowed 2026-10-22 to what a launch screen or app uses (D2-API-SCOPE/2026-10-15-reproof/api-scope/).
    // 2026-10-29 (D2, fold F3 slice B): a governed artifact's leaf downloads the governed DOCX
    // (/api/artifacts-center/:id/export). A shared claim, as a86ed04ed: the Artifacts center kept
    // its own. It opens two reads to a Vault-only organization, both organization-scoped
    // (docs/evidence/D2-ONE-ANA/2026-10-29/vault-artifact-leaf/README.md). The leaf's versions and
    // audit report (/api/concept2cure/projects/...) are NOT claimed here: that prefix holds 97
    // routes, 49 of them writes, and its claim is a decision of its own (same README).
    // 2026-10-29 (fold F3 slice C): the Artifacts center folded in, so /api/artifacts-center is
    // this claim alone. Its listing is the Vault's organization view, bound to the projects the
    // caller can open (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/README.md).
    apiPrefixes: ['/api/c2c/project-vault', '/api/vault/ingest', '/api/regulatory-programs', '/api/submission-ops/artifact-section-map', '/api/submission-ops/packages', '/api/vault/legal-holds', '/api/regulatory/documents', '/api/artifacts-center'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, PART11],
    notes: 'The program dossier tree (rule-pack builds) plus the filing cabinet: uploads are virus-scanned, SHA-256 hashed, auto-classified to a suggested dossier folder per the program\'s client-type taxonomy (CTD modules / device submission folders / TMF zones), and confirmed or moved via the governed, audited /file route. Includes the data room lane — every captured source with its derived captured→classified→filed stage.',
  },
  {
    id: 'review',
    label: 'The review board',
    navTier: 'project',
    layoutMode: 'review',
    icon: 'checkCircle',
    group: 'review',
    uiKit: 'mdx',
    // Launch-scope API (2026-09-25, ci:launch-scope-api): Review reads its board, queue, threads and tasks.
    // Narrowed 2026-10-22 to what a launch screen or app uses (D2-API-SCOPE/2026-10-15-reproof/api-scope/).
    apiPrefixes: ['/api/part11', '/api/review', '/api/concept2cure/review-tasks', '/api/concept2cure/review-threads', '/api/concept2cure/reviews/my-queue'],
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
    // `/api/submission-center` is NOT listed, deliberately. That router is
    // unmounted (server/bootstrap/register-governance-routes.ts) because it
    // carried no tenant column in any handler and its tables have no RLS
    // backstop — an unscoped cross-tenant write API with no consumer. This
    // field is contracted to be grounded in the mount table, so advertising it
    // here would point the next reader at a capability that was removed for
    // exactly that reason. The surface reads /api/submissions,
    // /api/region-profiles, /api/510k/estar/* and /api/c2c/projects.
    // Launch-scope API (2026-09-25, ci:launch-scope-api): the Submission Center signs governed actions.
    // 2026-09-29: '/api/510k/estar' narrowed to the two sub-paths
    // SubmissionCenter.tsx calls (the eSTAR tracker and the assembly verdict).
    // The rest of eSTAR (build, official fields, registration, filing
    // readiness) is the hidden device 510(k) kit.
    apiPrefixes: ['/api/submissions', '/api/region-profiles', '/api/510k/estar/submissions', '/api/510k/estar/assemble', '/api/c2c/projects', '/api/c2c/actions/sign'],
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
    // Launch-scope API (2026-09-25, ci:launch-scope-api): GatewayTransmittals.tsx assembled, preflighted and read identifiers through the package model (until 2026-10-17, below).
    // 2026-09-26: '/api/mdx' narrowed to '/api/mdx/gateways' (the routes this
    // surface owns, per `engineering` below). The whole namespace made every
    // device-kit API — risk items, clinical studies, IVD, labeling — answer as
    // launch in production. The other launch callers under /api/mdx are
    // claimed by their own surfaces (vault, admin-console) or on
    // LAUNCH_PLATFORM_API (industry profile, notifications).
    // 2026-10-17 (audit; FILING_SPINE F12, LX-13): a read-only transmittal log.
    // Transmit runs on the sequence (Submission Center's Dispatch tab, POST
    // /api/submissions/sequences/:id/transmit). The package picker, assemble,
    // identifiers, package transmit and rollback left this screen, so it claims
    // only the log and its per-row reads and signed act: /status, /ack and
    // /technical-rejection sit under it. With the bare /api/mdx/gateways gone,
    // the package transmit (/api/mdx/gateways/:region/:gateway/transmit), the
    // gateway roster and the transmit-independence dry run fall to the device
    // kit's /api/mdx claim and production refuses them (pinned in
    // server/middleware/__tests__/launch-scope-api-gate.test.ts).
    // /api/submission-ops is no longer called here; Vault and Tasks claim it
    // for their own reads.
    apiPrefixes: ['/api/mdx/gateways/transmittals'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Read-only transmittal log across the organisation: status, live status poll, ACK download, and the signed technical rejection. Transmit is on the sequence (Submission Center, Dispatch).',
    engineering: 'Routes: /api/mdx/gateways/transmittals.',
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
    notes: deferredSurfaceDescription('ectd-coauthor'),
  },
  {
    id: 'ectd-compile',
    label: 'Compile & export eCTD',
    navTier: 'project',
    layoutMode: 'submissions',
    icon: 'gitBranch',
    group: 'submission',
    uiKit: 'ectd_coauthor',
    /* Launch-scope API (2026-09-25, ci:launch-scope-api): EctdCompile reads
       orchestrator runs and their audit — `/runs`, not the mount root.
       Attribution is by longest prefix at a segment boundary, so
       '/api/submission-orchestrator' admitted every handler under the mount,
       including five standalone builders no screen calls (/m2/nonclinical,
       /m2/clinical, /m2/clinical-overview, /csr/tabulate, /validate/hardened),
       each of which composes regulated submission content from arrays in the
       REQUEST BODY. Narrowed to the segment the screens read, so the rest are
       unmapped and production refuses them 403 LAUNCH_SCOPE (GA plan item 1,
       decision 2026-10-05; /m2/qos, the CMC one, is deleted outright). */
    // The package screen reads source readiness, selects Vault supporting JSON
    // and previews deterministic tables. Attribute only these exact endpoints;
    // standalone CSR/Module 2 content builders retain their launch fences.
    // Narrowed 2026-10-22 to what a launch screen or app uses (D2-API-SCOPE/2026-10-15-reproof/api-scope/).
    apiPrefixes: ['/api/ectd-compile', '/api/ectd/export', '/api/ectd/validate', '/api/submission-orchestrator/runs', '/api/submission-orchestrator/csr/readiness',
      '/api/submission-orchestrator/csr/sources', '/api/submission-orchestrator/csr/source-preview', '/api/submission-orchestrator/csr/source-contract',
      // The CSR card's build control and its board (2026-10-29, CSR slices 3 and 7): start a
      // build bound to the run, read its sections, triage them, build narratives. Exactly the
      // jobs router, not the /api/csr builder prefix.
      '/api/csr/jobs',
      // The CSR card's pivotal declarations (D5, 2026-10-29): exactly this endpoint. The rest of
      // /api/csr-workflow (the board, claimed by the regulatory workspace) stays out of scope.
      '/api/csr-workflow/pivotal',
      // The eCTD reference (folded from ectd-publishing, D2 2026-10-29; EctdCompileReference.tsx):
      // the vocabulary listing and its lists, and the spec-version register. Exactly these two,
      // not ectd-publishing's whole /api/ectd: /api/ectd/v4 and the rest of /api/ectd/qualification
      // stay refused at launch (launch-reproof-narrowing.test.ts).
      '/api/ectd/controlled-vocab', '/api/ectd/qualification/spec-versions'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/submission-api',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'eCTD 4.0 backbone compile/validate/export across FDA/EMA, keyed on the program’s numeric project id.',
    engineering: 'Routes: /api/ectd-compile; the eCTD reference reads /api/ectd/controlled-vocab and /api/ectd/qualification/spec-versions.',
  },
  // ectd-publishing folded into ectd-compile (D2, 2026-10-29): its spec versions, Regional IG
  // OID and controlled vocabularies are eCTD Compile's eCTD reference, and `ectd-publishing` is an
  // alias that opens it (registryModel.ts). Its claim on /api/ectd moved as the two reads the
  // reference makes; /api/ectd/v4 had no caller (docs/evidence/D2-ONE-ANA/2026-10-29/fold-ectd-publishing/).
  {
    id: 'device-510k',
    label: '510(k) and eSTAR',
    navTier: 'project',
    layoutMode: 'section-workspace',
    icon: 'fileCheck',
    group: 'device',
    uiKit: 'mdx',
    // 2026-09-29: '/api/programs' added: /api/programs/:id/predicate-intel,
    // se-matrix and rtm are this app's (they were claimed by Projects).
    // Project-first MDX, 2026-10-23: useK510 reads the existing document
    // preview, candidate and SE-matrix routes. Keep the predicate claim to
    // these endpoint families rather than the entire intelligence namespace.
    // 2026-10-29 (trunk-red-sweep-2): '/api/mdx/audit' is the Audit trail tab its pathway screen
    // reads (programTabsService.ts); it was served only through other features' '/api/mdx' root claims.
    apiPrefixes: ['/api/510k/estar', '/api/510k/device', '/api/510k/projects', '/api/predicate-intelligence/candidates', '/api/predicate-intelligence/se-matrix', '/api/cerv2', '/api/cerv2-sections', '/api/fda-forms', '/api/programs', '/api/mdx/audit'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/predicate-intelligence',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'eSTAR section tree · content editor · predicate/SE intelligence panel. In progress.',
  },
  {
    id: 'device-cer',
    label: 'Clinical evaluation (CER)',
    navTier: 'project',
    layoutMode: 'section-workspace',
    icon: 'microscope',
    group: 'device',
    uiKit: null,
    // Existing CER GSPR and PMS/PMCF panes (useCerGspr/useCerPostMarket/
    // useCerPmsFeeds); the program-scoped routes retain their own governance.
    // 2026-10-29 (trunk-red-sweep-2): '/api/mdx/audit' is the Audit trail tab its pathway screen
    // reads (programTabsService.ts); it was served only through other features' '/api/mdx' root claims.
    apiPrefixes: ['/api/cer', '/api/cerv2', '/api/gspr/catalog', '/api/gspr/programs', '/api/post-market/programs', '/api/mdx/audit'],
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
    // 2026-10-05 (decision P-28, CMC / Module 3 joins the launch catalog): the
    // bare '/api/cmc' and '/api/cmc/module3-os' replaced by the segments the
    // CMC screens call, and the dead '/api/cmc/stability' mount dropped.
    // Attribution is by longest prefix, so the bare claim made every handler
    // under it answer as launch at the flip, called or not. Everything else
    // under /api/cmc is unmapped, which production refuses.
    // 2026-10-25: /projects/:id/process-capability was unmapped "until a launch
    // screen calls it". The Batch records tab calls it now (CmProcessCapability
    // in CmcModule.tsx), so it is claimed — and claimed at '/api/cmc/projects',
    // which is the whole of what this router serves under that segment.
    // The deferred /variations/classify caller is claimed narrowly below,
    // with its own launch-scope refusal in the route. Each prefix needs a caller in the CMC
    // screens (server/middleware/__tests__/launch-scope-api-gate.test.ts;
    // docs/evidence/CMC-M3-GA/2026-10-05/20-cmc-api-allowlist/).
    apiPrefixes: [
      '/api/cmc/drug-substances',
      '/api/cmc/drug-products',
      '/api/cmc/analytical-methods',
      '/api/cmc/qc-testing',
      '/api/cmc/stability-studies',
      '/api/cmc/process-validation',
      '/api/cmc/change-control',
      '/api/cmc/comparability-studies',
      '/api/cmc/container-closures',
      '/api/cmc/reference-standards',
      '/api/cmc/impurity-profiles',
      '/api/cmc/dissolution-profiles',
      '/api/cmc/material-specs',
      '/api/cmc/formulation-records',
      '/api/cmc/manufacturing-processes',
      '/api/cmc/characterization-studies',
      /* The §11.10(e) change history of one register record — who recorded it,
         who changed it, and what each change moved (URS-CMC-025). Its own
         namespace because the register is a path PARAMETER: a path whose first
         segment is a variable normalises to '/api/cmc/:p/:p/history', which no
         prefix can claim, and the only prefix that would have covered it is the
         bare '/api/cmc' that P-28 deliberately does not claim. */
      '/api/cmc/register-history',
      /* Pp/Ppk/Cp/Cpk over a program's recorded batch results, read by the
         Batch records tab. The one route this router serves under
         '/api/cmc/projects'. */
      '/api/cmc/projects',
      '/api/cmc/quality/qbd',
      '/api/cmc/ich-compliance',
      '/api/cmc/control-strategy',
      // Deferred UI caller; the route itself refuses when launch scope is on.
      '/api/cmc/variations/classify',
      '/api/cmc/specifications',
      '/api/cmc/batch-records',
      '/api/cmc/module3-board',
      '/api/cmc/agency-questions',
      '/api/cmc/module3-os/sections',
      '/api/cmc/module3-os/compile',
      '/api/cmc/module3-os/contradictions',
      '/api/cmc/module3-os/readiness',
      '/api/cmc/module3-os/provenance',
      '/api/cmc/module3-os/guard',
      '/api/cmc/module3-os/place-into-submission',
      '/api/cmc/module3-os/build-state',
      '/api/cmc/module3-os/build-section',
      '/api/cmc/module3-os/source-evidence',
      '/api/cmc/module3-os/register-links',
    ],
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
    label: 'IND forms',
    navTier: 'project',
    layoutMode: 'ind-checklist',
    icon: 'clipboardList',
    group: 'submission',
    uiKit: 'pdev',
    // Decision P-32, 2026-10-15: this surface is a feature of the Submission
    // Center launch app, and claims only the paths its screens call
    // (IndLifecycle.tsx and the IndFormsPanel.tsx it embeds). Attribution is
    // by longest prefix at a segment boundary, so the bare /api/ind-lifecycle
    // it claimed until then would have put every route under it in the
    // release: the 312.32 safety report, the E2B(R3) ICSR and the ICSR
    // transmit among them. Those are claimed by `pharmacovigilance`, outside
    // the release; the sequence, portfolio and /submission/:id register routes
    // stay unclaimed (a prefix cannot admit the registers without the safety
    // registers beside them). Of /api/ind-master-data only /sponsors is
    // claimed (2026-10-22): IndApplicantIdentity.tsx lists, creates and edits
    // the sponsor record the forms print, and it shipped calling an unclaimed
    // path, so production refused it 403. Agents and investigators have no
    // screen caller and stay unclaimed.
    // /api/ind-lifecycle/clock is the server's evaluateRegulatoryClock, which
    // the screen calls in place of the client copy it carried until 2026-10-15;
    // /readiness is not claimed — the screen's readiness verdict comes with the
    // checklist read.
    // 2026-10-29: '/api/ind-lifecycle/briefing-book' removed. Since 5894e1aaa
    // the briefing book is the project's meeting-package document in the
    // editor, and no screen of this surface calls the form assembler or its
    // /pdf. The only caller left is AgencyMeetings.tsx (/pdf), whose
    // agency-meetings surface is outside the release. So the routes are
    // unclaimed and refused in production as unattributed
    // (docs/evidence/D2-ONE-ANA/2026-10-29/core-project-record-gating/).
    // Pinned by server/services/entitlements/__tests__/ind-launch-claim.test.ts.
    apiPrefixes: [
      '/api/ind-checklist',
      '/api/ind-forms',
      '/api/ind-master-data/sponsors',
      '/api/ind-lifecycle/clock',
      '/api/ind-lifecycle/cover-letter',
      '/api/ind-lifecycle/loa',
      '/api/ind-lifecycle/right-of-reference',
      '/api/ind-lifecycle/annual-report',
      '/api/ind-lifecycle/amendment-plan',
      '/api/ind-lifecycle/amendment',
    ],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes:
      'IND checklist and Module 1 forms (1571, 1572, 3674); cover letter, briefing book, Letter of ' +
      'Authorization and right of reference; annual reports and amendments placed into the IND eCTD sequence. ' +
      'IND safety reports are not part of this release.',
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
    notes: deferredSurfaceDescription('template-library'),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    navTier: 'project',
    layoutMode: 'tasking',
    icon: 'checkSquare',
    group: 'collaboration',
    uiKit: 'tasking',
    // Launch-scope API (2026-09-25, ci:launch-scope-api): MdxSurfaceHost (useMdxPrograms, useWorkbench, useSubmissions) and the shell's TaskTray call these.
    // Launch-scope API (2026-09-25, ci:launch-scope-api): the task board and the shell's task tray.
    // /api/project-rules: the task board reads the rule definitions it shows
    // (TaskBoard.tsx); claimed by no surface until the gate saw it (2026-10-01).
    // Narrowed 2026-10-22 to what a launch screen or app uses (D2-API-SCOPE/2026-10-15-reproof/api-scope/).
    apiPrefixes: ['/api/task-management/assignees', '/api/task-management/board', '/api/task-management/filings', '/api/task-management/messages', '/api/task-management/my-work', '/api/task-management/tasks', '/api/task-management/templates', '/api/regulatory/tasks', '/api/regulatory-programs', '/api/submission-ops/artifact-section-map', '/api/submission-ops/packages', '/api/approval-workflows/pending', '/api/tasks/messages', '/api/tasks/my-work', '/api/tasks/tasks', '/api/tasks/templates', '/api/project-rules'],
    anaToolFamilies: [],
    sharedContract: '@shared/schema',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE, 'motion-discipline'],
    notes: 'Org-scoped unifiedTasks board (@shared/schema unifiedTasks · taskDependencies) + critical-path DAG, channels, messages, activity feed, presence, mentions, due dates. See ui_kits/tasking + ui_kits/task-tray.',
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
    notes: 'ICH E6(R3) Appendix A IB section tree with per-section readiness over ib-builder.',
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
    apiPrefixes: ['/api/biostat', '/api/ana-biostats', '/api/biostat-bridge'],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [A11Y, TONE],
    notes: 'SAP authoring, power analysis, TLF shells, adaptive trial plans, IDMC. Loads the program\'s persisted study designs through the biostatistics bridge: gaps, filing placement per application type, governed sample-size write-back and task raising.',
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
    label: 'Protocol analysis',
    navTier: 'specialist',
    layoutMode: 'report-engine',
    icon: 'barChart',
    group: 'evidence',
    uiKit: null,
    // '/api/haq-manager' removed 2026-10-18 with the store it named; the report engine never called it.
    apiPrefixes: ['/api/intelligence'],
    anaToolFamilies: [],
    sharedContract: '@shared/types/intelligence',
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [PART11, A11Y, TONE],
    notes: 'Protocol-derived drafts: design recommendations, statistical insights and IND-readiness notes, with organization-scoped CSR-library aggregates and a handoff to Authoring.',
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
    label: 'IVDR evidence',
    navTier: 'specialist',
    layoutMode: 'device-diagnostics-workbench',
    icon: 'stethoscope',
    group: 'device',
    uiKit: 'risk',
    // 2026-10-29 (trunk-red-sweep-2): the families this feature's screens call, not the /api/mdx root.
    // A Projects feature since 62a8d5e7; a root claim served every device-kit route under it.
    // 2026-10-29 (ivd-board-under-diagnostics): the readiness panel's IVDR board and workbench read the last two.
    // Shared with ivd-completeness, which keeps its claim until the F2 fold (founder decision 4).
    apiPrefixes: ['/api/mdx/audit', '/api/mdx/cdx', '/api/mdx/clia', '/api/mdx/ivdr', '/api/manufacturing', '/api/ivdr', '/api/ivd-completeness', '/api/ivd-assessments'],
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
    // 2026-10-29 (trunk-red-sweep-2): the families this feature's screens call, not the /api/mdx root.
    // A Projects feature since 62a8d5e7; a root claim served every device-kit route under it.
    apiPrefixes: ['/api/mdx/labeling'],
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
    // 2026-10-29 (trunk-red-sweep-2): the families this feature's screens call, not the /api/mdx root.
    // A Projects feature since 62a8d5e7; a root claim served every device-kit route under it.
    apiPrefixes: ['/api/mdx/risk-items'],
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
  // setup folded into admin-console (D2, 2026-10-29): the organisation's name and client
  // type, the gateway, session, PDF/A, retention and legal-hold cards are on Admin and
  // access → Settings, and `setup` is an alias that opens that tab (registryModel.ts). Its
  // claims moved there or were never its own: /api/setup, /api/api-keys and the hold routes
  // are admin-console's; /api/admin and /api/users are NEVER_GATED; /api/regulatory-programs
  // and /api/c2c/project-vault stay the Vault's (docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/).
  {
    id: 'audit-trail',
    label: 'Audit trail',
    navTier: 'admin',
    layoutMode: 'audit',
    icon: 'scroll',
    group: 'admin',
    uiKit: null,
    // Launch-scope API (2026-09-25, ci:launch-scope-api): AdminSurfaces.tsx AuditTrail reads the ledger.
    apiPrefixes: ['/api/admin/audit', '/api/part11', '/api/audit-trail/ledger'],
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
    notes: deferredSurfaceDescription('qmp'),
    engineering: 'Routes: /api/quality.',
  },
  // part11-console folded into audit-trail (D2, 2026-10-29): Audit trail states both
  // audit chains' verdicts, and its entry above already claims /api/part11.
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
  /* No `billing`. Billing folded into Licensing (D2, 2026-10-29;
     docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/): the invoice list,
     checkout and the billing portal are Licensing's, for billing
     administrators, and `licensing` already claims all of '/api/billing'
     (ui-surface-registry.ui-v2.ts). The id is an alias of `licensing`. */
  /* No `ana-memory`. AnA memory folded into the conversation (D2, 2026-10-29;
     docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/): its two real reads are
     the conversation's "What AnA remembers", which claims the one route it reads
     ('/api/mdx/ana/memory/profile', ui-surface-registry.ui-v2.ts). The atom list,
     verify, supersede and thread routes went with the screen. */


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
