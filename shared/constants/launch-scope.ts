/**
 * Launch scope — the one list of what ships in the launch catalog.
 *
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D2: seven apps for a new
 * organisation (six until 2026-09-30, when the founder made Reporting &
 * analytics a launch app; seven until 2026-10-12, when CMC / Module 3 joined
 * under decision P-28; eight until 2026-10-17, when Submission Readiness was
 * folded into Submission Center), every other surface behind a flag that is
 * off in production. This file IS that flag's data.
 *
 * "On by default" is the modules list, not the app list: a launch app's
 * SURFACES are inside the boundary, and its MODULES are what a new
 * organisation is granted. CMC / Module 3 lists surfaces and no modules on
 * purpose — see its entry. It is read by:
 *
 *   - server/services/entitlements/navigation-entitlements.ts — emits a
 *     `launch-scope` verdict for every surface outside the scope when
 *     enforcement is on, so the rail, ⌘K, the Apps catalog and a deep link all
 *     read the same answer from the same place;
 *   - server/services/entitlements/launch-scope.ts — grants the launch
 *     modules to a newly created organisation;
 *   - scripts/ci/check-launch-scope.mjs — proves every id here is a real,
 *     routable surface with a catalog row, and that no launch surface imports
 *     record fixtures.
 *
 * The client never decides scope from a build flag. The server decides, once,
 * per request, and says so in the verdict payload (`launchScope.enforced`), so
 * a staging instance with enforcement off and a production instance with it
 * on run the same client bundle.
 *
 * WHY SURFACE IDS AND MODULE IDS ARE LISTED SEPARATELY. A surface is what the
 * shell routes to (`SURFACE_VIEWS`, `UI_SURFACES`); a module is a row in
 * `available_modules` that an organisation can hold a grant for. The two id
 * spaces were reconciled to overlap (db/migrations/20260810_reconcile_module_
 * catalog.sql) but not every surface is licensable: `regulatory-workspace`
 * and `home` have no catalog row and are unconditionally available. The gate
 * checks each list against the structure it belongs to.
 */

export interface LaunchApp {
  /** Stable id for the app as the launch plan names it. */
  id: string;
  label: string;
  /** Surface ids (SURFACE_VIEWS keys) that make up this app. */
  surfaces: readonly string[];
  /** available_modules ids granted at organisation creation. */
  modules: readonly string[];
}

/** The seven launch apps, in the order the definition of done lists them. */
export const LAUNCH_APPS: readonly LaunchApp[] = [
  {
    id: 'projects',
    label: 'Projects',
    // CPO decision, 2026-10-08 (docs/SURFACE_DECISIONS_2026-10-08.md, under the
    // founder's delegation of 2026-10-07): the program journey and the filings
    // catalog left the app. The journey is empty for every program a client
    // creates (only the demo seed fills it); the catalog's Start drops the
    // choice, and the New project wizard already persists the filing type.
    // Founder request 2026-10-16: communication is a core client destination.
    // Existing module licensing still applies; no new organisation grant.
    // Founder request, 2026-10-23: MDX disciplines and pathways are features
    // of the client's project, not separate applications. Reach the existing
    // surfaces here; keep every feature's existing commercial verdict. This
    // list is pinned against MDX_PROJECT_FEATURE_SURFACE_IDS by the scope test.
    // Literal ids are required by ci:launch-scope's structural parser.
    // 2026-10-29 (D2): the device task workbench folded into Tasks, which this
    // app already holds; its old address resolves there (DEEP_LINK_ALIASES).
    // 2026-10-29 (D2, fold F3): the device vault folded into the Vault app's
    // Vault; its old address resolves there too.
    surfaces: [
      'projects', 'project-home', 'tasks', 'communication-center',
      'device-workstream', 'device-510k', 'device-pma', 'device-cer',
      'device-diagnostics', 'ivd-completeness', 'device-clinical-studies', 'device-software',
      'device-engineering', 'device-udi', 'device-postmarket', 'device-presub',
      'device-validation', 'device-submission',
      'device-analytics', 'design-controls', 'human-factors', 'risk', 'labeling',
    ],
    modules: ['projects', 'tasks'],
  },
  {
    id: 'vault',
    label: 'Vault',
    // 2026-10-29 (D2, fold F3 slice C): the Artifacts center folded into the
    // Vault as its organization view (DEEP_LINK_ALIASES). Its module is no
    // longer granted to a new organisation, and an existing grant is kept: the
    // catalogue row is deprecated, never deleted (CLAUDE.md Rule 1;
    // db/migrations/20260810_reconcile_module_catalog.sql). The Vault is free at
    // the same tier, so no organisation loses a function.
    surfaces: ['vault'],
    modules: ['vault'],
  },
  {
    id: 'authoring',
    label: 'Authoring',
    surfaces: [
      'document-authoring',
      'review',
      // Protocol development joined the launch catalog by founder decision on
      // 2026-09-21 (docs/evidence/WI/2026-09-21). It is the clinical protocol
      // authoring workspace — sections, objectives, eligibility, schedule of
      // assessments and the governed registers — read from protocol_documents
      // and its child tables; the catalog row protocol-dev is seeded by
      // db/migrations/20260810_reconcile_module_catalog.sql.
      //
      // It takes the place of authoring-engine, removed the same day: that
      // surface (surfaces/AuthoringEngine.tsx) is a static explainer built from
      // inline constants — no editor, no authoring API — and a launch app
      // promises real work. The component stays in the tree behind the flag.
      // (No quoted ids in these comments: ci:launch-scope reads the array
      // text and would count one.)
      'protocol-dev',
      // CPO decision, 2026-10-08: the template library and the regulatory
      // workspace left the app. A saved template formats no authored document
      // (export takes no template; Adjust and Apply only send a chat prompt),
      // and the workspace is a fixed paragraph where the editor should be,
      // over a store no program writes. The editor is the Authoring app.
    ],
    modules: ['document-authoring', 'review', 'protocol-dev'],
  },
  {
    id: 'submission-center',
    label: 'Submission Center',
    // CPO decision, 2026-10-08: three screens left the app. The co-author is a
    // second editor over a second store, and its Validate and Compliance tabs
    // report the same failure whatever the text says (they read section rows
    // placement never writes); filing copies are placed from the Builder and
    // edited in the Authoring editor. The dossier map reads a store programs
    // created in the product never write, so it is always empty; Project home's
    // dossier readiness is computed from the program's own sections. The
    // publishing center is a reference page that publishes nothing.
    //
    // Decision P-32, 2026-10-15 (founder's delegation): the IND lifecycle and
    // forms screen is a feature of this app. An amendment on a US commercial
    // IND needs its 1571, its cover letter and often a Letter of
    // Authorization, and the engines that build them sat behind a locked
    // surface. The surface id is listed and the module list is NOT changed,
    // as in P-28: listing a surface lifts the launch-scope lock, listing a
    // module would write a grant for every new organisation and outrank the
    // standard tier the product owner set
    // (db/migrations/20260823_module_catalog_commercial_packaging.sql). The
    // API claim is an allow-list of the paths that screen calls, in the
    // surface registry. IND safety reporting (21 CFR 312.32) and ICSR
    // transmission stay shut: their routes are claimed by the out-of-scope
    // pharmacovigilance surface, and the IND screen hides the safety-report
    // card (docs/LAUNCH_DEFINITION_OF_DONE.md, P-32).
    //
    // The agency-questions screen is NOT listed (coordinator decision on P-32,
    // 2026-10-15). Its approve records a plain status change, with no Part 11
    // signature, reason or role check, and the response package sent to FDA
    // is assembled from those approvals; answers to FDA letters are also third
    // in the beta's job order (docs/design/WORKFLOW_DECISION_2026-10-08.md §1).
    // Agency questions open once approval is a signed act.
    //
    // Founder decision, 2026-10-17: Submission Readiness is no longer an app of
    // its own. Its screen reads the same per-sequence verdict as this app's
    // Validation and Dispatch tabs (programSequence.ts, /sequences/:id/
    // dispatch-readiness), which is where a sequence is dispatched (P-33), so a
    // second app gave one verdict two homes. Its surface and its module move
    // here unchanged: LAUNCH_MODULE_IDS, and so what a new organisation is
    // granted, is the same set as before. The Orchestration and Inconsistency
    // boards stay out of this release: both read the integer project spine,
    // which a program reaches only through the anchor intake writes when the
    // organisation has exactly one client workspace, and signup creates none
    // (VSR-001 §14.3, decided §16). They return when they read the program spine.
    surfaces: ['submission-center', 'ectd-compile', 'gateway-transmittals', 'ind-checklist', 'dispatch-readiness'],
    modules: ['submission-center', 'ectd-compile', 'gateway-transmittals', 'dispatch-readiness'],
  },
  {
    id: 'qms',
    label: 'QMS controlled documents',
    // CPO decision, 2026-10-08: quality-management plans left the app. A plan's
    // gates and CTQ factors cannot be authored anywhere, and nothing reads them.
    surfaces: ['quality'],
    modules: ['quality'],
  },
  {
    id: 'cmc',
    label: 'CMC / Module 3',
    /* Founder's delegation of 2026-10-07, decision P-28 (2026-10-05): the CMC
       operating system ships in the launch catalog, with a composition
       boundary — small-molecule Module 3 for a US IND
       (services/cmc/composition-scope.ts). The one path is compile, approve
       under Part 11, pass the final-export gate, place into the program's own
       IND sequence.

       `modules` IS DELIBERATELY EMPTY, and that is not an omission.
       `provisionLaunchModules` writes an explicit grant for every module id
       listed here, and a grant outranks tier permanently
       (navigation-entitlements reads subscription state before tier). Listing
       'cmc' would therefore hand the module to every new organisation and
       silently overturn the professional band the product owner set on
       2026-08-24 (db/migrations/20260824_cmc_professional_tier.sql), whose
       grandfather grants already cover every organisation entitled then.
       Pricing is the founder's call, not a side effect of a scope list.

       Listing the SURFACE is what this entry is for, and it is enough:
       `applyLaunchScope` "never widens anything" — it lifts the
       'launch-scope' lock and leaves the catalog verdict, so the professional
       band and any explicit grant still decide who sees it. Until this entry
       the screen was refused to everyone, entitled or not, and every path
       under /api/cmc was unattributed. */
    surfaces: ['cmc'],
    modules: [],
  },
  {
    id: 'reporting',
    label: 'Reporting & analytics',
    // Founder decision, 2026-09-26: Reporting and analytics is a central service
    // for every client type, like Vault, Projects, Submissions and Tasks, and
    // belongs on the rail of every organisation. The canvas is the rail entry;
    // the audit and compliance reports surface is reached from it and from the
    // audit trail. Both were hidden in production because neither was listed here.
    surfaces: ['insights', 'compliance-reports'],
    modules: ['insights'],
  },
] as const;

/**
 * Surfaces the shell needs to function, or that compliance requires, whatever
 * the catalog says. Each carries the reason it is here so the list cannot grow
 * by convenience.
 */
export const LAUNCH_SHELL_SURFACES: Readonly<Record<string, string>> = {
  home: 'the shell landing surface; synthesised by V2App, has no registry row',
  apps: 'the Apps catalog — where a locked destination explains itself',
  'conversation-thread': 'AnA conversation; the product is chat-first',
  'audit-trail': '21 CFR §11.10(e): the audit trail is never switchable',
  // part11-console folded into audit-trail (D2, 2026-10-29): both chain verdicts are stated there.
  'admin-console': 'organisation administration',
  setup: 'first-run configuration',
  onboarding: 'first-run flow',
  'onboarding-ingest': 'step within the onboarding flow',
  billing: 'account administration',
  usage: 'account administration',
  licensing: 'account administration — grants catalog entries',
  'master-licensing': 'platform-owner administration',
  'access-requests': 'how a member asks for a locked app',
  'identity-console': 'SSO / SCIM; a security reviewer expects it (D6)',
};

// CPO decision, 2026-10-08: three shell entries left. AnA Command answers
// only enterprise organisations and tells a client two of its runs are
// recorded to the audit trail when they are not. AnA memory lists a store
// nothing writes instead of the memory AnA loads each turn, so it tells a
// client AnA remembers nothing; it returns reading that memory. Training has
// no path, lesson or certification behind it; training of record is the QMS
// read-and-understood record.

/** Every surface id in the launch scope: the seven apps plus the shell set. */
export const LAUNCH_SURFACE_IDS: ReadonlySet<string> = new Set([
  ...LAUNCH_APPS.flatMap((a) => a.surfaces),
  ...Object.keys(LAUNCH_SHELL_SURFACES),
]);

/** Every available_modules id granted at organisation creation. */
export const LAUNCH_MODULE_IDS: readonly string[] = Array.from(
  new Set(LAUNCH_APPS.flatMap((a) => a.modules)),
);

export function isLaunchSurface(id: string): boolean {
  return LAUNCH_SURFACE_IDS.has(id);
}

/** The app a surface belongs to, or null for a shell surface / out of scope. */
export function launchAppFor(surfaceId: string): LaunchApp | null {
  return LAUNCH_APPS.find((a) => a.surfaces.includes(surfaceId)) ?? null;
}

/**
 * The verdict source name shared by server and client. Declared here so the
 * two `NavEntitlementSource` unions cannot drift on the spelling.
 */
export const LAUNCH_SCOPE_SOURCE = 'launch-scope' as const;
