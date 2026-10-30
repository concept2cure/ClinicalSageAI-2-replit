# A2.8 — reach MDX through filtered Projects

Launch row D2; branch `concept2cure-v2`; base `01dbd4eb`.

## What already exists

Checked from `01dbd4eb`; this reaches existing functionality under launch row D2.

- `client/src/concept2cure/v2/registryModel.ts` owns string `DEEP_LINK_ALIASES`
  and typed `ALIAS_APPLIES`. `mdx` currently aliases the retained
  `device-workstream`; it has no standalone registry/view row. Existing dossier
  aliases already request destination actions through this mechanism.
- `client/src/concept2cure/v2/routing.ts` `destinationFor` resolves alias, target
  scope and action. `V2App.tsx` applies that action through the validated bus for
  copied URLs and imperative navigation, then writes one canonical URL. The
  URL effect preserves existing query/hash and does not replay an alias after
  canonicalization.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` owns `projects.filter` and
  the MDX workstream selection. `ProjectPortfolioFilters.tsx` renders it.
  `useLiveRows`/the canonical `/api/c2c/projects` read filter before paging;
  no device portfolio reader or second classifier is needed. Existing filters
  are view-local, not persisted by the current Projects canonical URL.
- `shared/navigation/index.ts` retains the global `mdx` navigation target for
  AnA/old handles; its description still claims a module home and must describe
  the real filtered Projects destination. No new target or commercial grant.
- `surfaces/ProjectMdxWorkflow.tsx` and `ProjectHome.tsx` already reach the
  selected device project's recorded pathway work. `device-workstream`'s
  shell, target, catalogue and feature ids remain until their A2.10 parity work.
- `surfaceRouting.test.ts`, `projectDestination.test.ts`,
  `projectDestinationShell.test.tsx`, `navigationReachability.test.ts`,
  `projectsClientFilter.test.tsx` and `projectsPortfolioTruncation.test.tsx`
  cover routing, the real shell/action bus and existing scoped filters.
  `tests/e2e/projects-client-filter.e2e.ts` supplies the native project-creation
  and filtered portfolio pattern. Old expectations still pin MDX to the kit.
- Deleted-history search: `git log --all --diff-filter=D` over
  `client/**/*Mdx*`, `client/**/*MDX*`, `client/**/*mdx*` returned no deletion
  commits. The kit owner is retained, not reconstructed.

Reach `mdx` through the existing alias/action pair as Projects plus
`projects.filter {workstream:'MDX'}`. Prove copied links with/without project,
query/hash preservation, imperative navigation, one-shot action behavior and
real filtered portfolio/open-project reachability. Preserve existing Projects
filter lifetime rather than introduce another persistence store or router.

## Scope and qualification

The change reaches one existing Projects filter through the shared destination
and action bus. It adds no service, surface, route, query, classifier, table,
dependency or commercial grant. The retained device-workstream shell and its
functions are outside this alias-only fold; A2.10 carries its parity separately.
## Qualification

Before the implementation, the targeted tests failed in **seven intended cases**
with 27 passing across four suites. They pinned the old kit destination, absent
filter action, misleading module-home description and failed shell reachability.
After the existing alias/action pair was changed, **34/34 passed**. The combined
regression passed **257/257 tests in 23 files** (41.96 seconds), covering the real
shell, validated action bus, scope/no-project resolution, navigation/chips,
shared contracts, AnA tool navigation, device project workflows, canonical list
read and the existing client/workstream/pathway filters.

`projectDestinationShell.test.tsx` proves the actual V2App/action-bus path with
stubbed canvas/network: copied links with and without project context preserve
query/hash, StrictMode applies MDX once, imperative navigation on already-open
Projects writes one canonical history entry, and a later manual filter choice
survives rerenders. The retained device-workstream still has its view, target,
registry and launch/feature boundary; A2.8 does not claim its A2.10 parity.

The native Chromium test passed in **15.8 seconds**. A fresh synthetic sign-up
and real canonical creators recorded one IVD 510(k) and one drug IND project.
With and without a selected project, `/concept2cure/mdx` reached Projects with
MDX selected; its native `/api/c2c/projects?ws=MDX` read returned only the IVD
project and a scoped total of one. The user cleared the filter, searched the
drug project without the alias resetting it, then opened the IVD's recorded
510(k) Plan and analytical-performance work package. Query/hash/project context
survived, and the native filtered `limit=1` read retained the same scoped total.

This uses a freshly provisioned local `concept_handoff` database and the
`app_service` runtime role with RLS on; authentication uses the explicit local
development setting. It qualifies navigation/data placement rather than
production authentication or formal OQ. Tokens remained inside browser context;
selected JSON and screenshots contain synthetic records. Runtime/auth logs are
excluded. No provider call or existing non-core API was needed.

Production client/server/audit-verifier build passed (Vite 20.83 seconds).
Scoped ESLint has zero errors and the existing registryModel file-length
warning. Independent read-only source review found no material issue. Full
repository TypeScript passed with zero errors against the unchanged zero
baseline (`typecheck.log.gz`). Normal no-growth/publication hooks also check
the final committed tree; no baseline expansion or bypass is used.

## Deliberate boundary and next work

The filter retains the existing Projects view-local lifetime. Opening or
reloading the canonical Projects URL uses its ordinary defaults; revisiting the
legacy MDX URL applies MDX once. This does not introduce a second router or a
persistence store. Device-workstream and its still-unmigrated functions remain.
The next planned slice is A2.9: retire the duplicate project creators only after
naming and proving their canonical wizard/API replacements. A2.10 retains its
per-function parity prerequisites.
