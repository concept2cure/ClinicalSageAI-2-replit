/**
 * Launch scope — the one list of what ships in the launch catalog.
 *
 * `docs/LAUNCH_DEFINITION_OF_DONE.md` row D2: six apps on by default for a
 * new organisation, every other surface behind a flag that is off in
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

/** The six launch apps, in the order the definition of done lists them. */
export const LAUNCH_APPS: readonly LaunchApp[] = [
  {
    id: 'projects',
    label: 'Projects',
    surfaces: ['projects', 'project-home', 'program-journey', 'filings-catalog', 'tasks'],
    modules: ['projects', 'program-journey', 'filings-catalog', 'tasks'],
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
      'template-library',
      'review',
      'regulatory-workspace',
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
    ],
    modules: ['document-authoring', 'template-library', 'review', 'protocol-dev'],
  },
  {
    id: 'submission-center',
    label: 'Submission Center',
    surfaces: [
      'submission-center',
      'dossier-map',
      'ectd-compile',
      'ectd-coauthor',
      'ectd-publishing',
      'gateway-transmittals',
    ],
    modules: [
      'submission-center',
      'dossier-map',
      'ectd-compile',
      'ectd-coauthor',
      'ectd-publishing',
      'gateway-transmittals',
    ],
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
    // refused the program's id (VSR-001 §14.3, decided §15). Their code stays;
    // they return when the review and the scan read the program spine.
    surfaces: ['dispatch-readiness'],
    modules: ['dispatch-readiness'],
  },
  {
    id: 'qms',
    label: 'QMS controlled documents',
    surfaces: ['quality', 'qmp'],
    modules: ['quality', 'qmp'],
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
  'ana-command': 'AnA command surface',
  'ana-memory': 'AnA memory; the user must be able to see what AnA remembers',
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
  training: 'account administration',
  'identity-console': 'SSO / SCIM; a security reviewer expects it (D6)',
};

/** Every surface id in the launch scope: the six apps plus the shell set. */
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
