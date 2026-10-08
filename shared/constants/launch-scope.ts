/**
 * Launch scope — the one list of what ships in the launch catalog.
 *
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D2: seven apps on by default for a
 * new organisation (six until 2026-09-30, when the founder made Reporting &
 * analytics a launch app), every other surface behind a flag that is off in
 * production. This file IS that flag's data. It is read by:
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
    surfaces: ['projects', 'project-home', 'tasks'],
    modules: ['projects', 'tasks'],
  },
  {
    id: 'vault',
    label: 'Vault',
    surfaces: ['vault', 'artifacts-center'],
    modules: ['vault', 'artifacts-center'],
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
    surfaces: ['submission-center', 'ectd-compile', 'gateway-transmittals'],
    modules: ['submission-center', 'ectd-compile', 'gateway-transmittals'],
  },
  {
    id: 'submission-readiness',
    label: 'Submission Readiness',
    // The deterministic dispatch gate, which is keyed to the program's sequence.
    // The Orchestration and Inconsistency boards are not in this release: both
    // read the integer project spine, which a program reaches only through the
    // anchor intake writes when the organisation has exactly one client
    // workspace, and signup creates none. In every organisation signup creates,
    // the Orchestration board found no program and the Inconsistency board
    // refused the program's id (VSR-001 §14.3, decided §16). Their code stays;
    // they return when the review and the scan read the program spine.
    surfaces: ['dispatch-readiness'],
    modules: ['dispatch-readiness'],
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
  'part11-console': 'how Part 11 compliance is evidenced; never switchable',
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
