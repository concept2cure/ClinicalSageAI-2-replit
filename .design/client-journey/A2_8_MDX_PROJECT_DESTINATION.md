# A2.8: converge the MDX alias onto filtered Projects

Launch row D2, 2026-10-26. Continues `SLICE_A2_PLAN.md` A2.8 and the accepted
central-service direction in `INFORMATION_ARCHITECTURE.md`. Starting source
`01dbd4eb3` includes the later A2.7b section-tracking convergence.

## What already exists

- `client/src/concept2cure/v2/registryModel.ts`: `mdx` is an alias-only id for
  `device-workstream`. `ALIAS_APPLIES` already carries existing actions for old
  dossier links. It does not yet carry an MDX filter.
- `client/src/concept2cure/v2/routing.ts`: `destinationFor` resolves alias,
  project requirement and action for URL and imperative navigation. It preserves
  action parameters and owns the no-project chooser; no second resolver is needed.
- `client/src/concept2cure/v2/V2App.tsx` and `surfaceActions.ts`: the shell sends
  the existing action through its validated bus and replaces copied alias URLs
  with one canonical destination. A2.7's real-shell tests exercise this contract.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` and
  `ProjectPortfolioFilters.tsx`: the portfolio already owns MDX, pathway and
  accessible-client filters, explicit errors/filtered empties, and guarded
  `projects.filter` handling. Home/onboarding use its existing intake wizard.
- `shared/navigation/surface-actions.ts`: the existing `projects.filter` schema
  already admits `workstream: 'MDX'`; this is a filter, never an entitlement.
- `server/routes/c2c/projects.ts` and
  `server/services/c2c/project-portfolio.ts`: the canonical portfolio applies
  MDX classification and accepted actor/client anchors before paging, and reads
  matching totals. No new route, query, store or grant is needed.
- `shared/navigation/index.ts`: global `mdx` target still describes the old kit
  home; update its wording to the actual filtered Projects outcome. The separate
  `device-workstream` target, registry, shell and catalogue stay for A2.10.
- `server/services/ana/navigationTools.ts`, `AnaToolExecutor.ts`, client
  `navParams.ts` and `V2App.tsx` already carry `navigate_to`/mentions/locked-screen
  identities through the shared alias. No server MDX-to-device hardcode was found;
  the existing target remains global and does not bypass entitlement checks.
- `tests/e2e/projects-pathway-counts.e2e.ts` already creates device and drug
  projects through canonical human-scoped intake and checks bounded counts and
  actual tabs. Extend this proof to the alias rather than duplicate the fixture.
- `surfaceRouting.test.ts`, `projectDestination.test.ts` and
  `projectDestinationShell.test.tsx` already test routing and one-time delivery.
  Extend them to MDX with and without an open project, copied URLs and imperative
  navigation; preserve feature addresses and dossier behavior.

Searches: aliases and `projects.filter` in v2/shared navigation, portfolio and
launch-scope owners, module-catalogue creators, navigation AnA tools; deleted
history via `git log --all --diff-filter=D` over MDX, Project, registry,
navigation and portfolio names. History includes kit consolidation `2895218b8`,
sample removal `806733231`, MDX template convergence `0fc2fc294` and dead CTD
cleanup `7855b5115`. No deletion or replacement implementation is proposed here.

## Change and proof boundary

Resolve `mdx` to `projects`, applying `projects.filter {workstream: 'MDX'}` through
the shared destination contract. Retain the current global target and give it
accurate description. Add red-first routing/action delivery checks and extend the
native pathway browser proof. Existing server scope, counts, wizard and project
step state keep their owners. No new navigation surface or production dependency.

Evidence: `docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.8/README.md`.
