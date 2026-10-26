# A2.8: MDX links reach filtered Projects

Launch row D2, 2026-10-26. Qualified from `01dbd4eb3`; no launch admission or
formal qualification claim is made by this routing change. Canonical branch:
`concept2cure-v2`.

## What already exists

The inventory and limits are recorded in
`.design/client-journey/A2_8_MDX_PROJECT_DESTINATION.md`:
`registryModel.ts` already aliases MDX; `routing.ts`/`V2App.tsx` and
`surfaceActions.ts` already resolve and deliver alias actions; `Projects.tsx`
and `ProjectPortfolioFilters.tsx` already own the MDX filter and guarded wizard;
`shared/navigation/surface-actions.ts` already validates that filter;
`server/routes/c2c/projects.ts` and `server/services/c2c/project-portfolio.ts`
already apply actor/client/workstream/pathway scope before paging and counts.
`shared/navigation/index.ts` still describes the old MDX kit home.
`tests/e2e/projects-pathway-counts.e2e.ts` already proves native device/non-device
filtering. The existing routing and real-shell suites own reachability/action
delivery. Those owners are extended; no parallel portfolio or filter is added.

Deleted-history searches covered MDX, Project, registry, navigation and portfolio
names; relevant prior convergence/removal commits include `2895218b8`,
`806733231`, `0fc2fc294`, `7855b5115`. No surface/route/store is deleted here.
`device-workstream` and its catalogue remain for A2.10.

## Pre-merge continuation verification

The table below qualifies the continuation before merging the independently
published `1f6a8bf7c`. That snapshot's complete evidence is retained under
`pre-merge-1f6a8bf7c/`; its source hashes, 257-test qualification, native IVD/Plan
flow and TypeScript log belong to that pre-merge source. They are not reused as
proof of the final combined tree. Both implementations used the same alias and
action owners; duplicate test assertions were consolidated.

| Check | Result | Evidence |
| --- | --- | --- |
| New routing/shell expectations against unchanged production | 8 fail, 22 pass; missing MDX filter/old device destination | `routing-red.log.gz` |
| Extended native browser against unchanged production | Fails: expected Projects, actual device-workstream | `browser-red.log.gz` |
| Same routing/shell checks after alias change | 30 pass, 3 suites | `routing-green.log.gz` |
| Navigation, AnA, Live Drive, portfolio and incoming dossier/tracking regressions | 144 pass, 13 suites | `client-navigation-regression.log.gz` |
| Existing portfolio counts, accepted client/anchor and parent-access SQL/route checks | 76 pass, 3 suites | `server-regression.log.gz` |
| Native Chromium with real server/PostgreSQL | 1 flow passes, 13.3 seconds | `browser-green.log.gz`, screenshots, `pathway-counts.json` |
| Production client/server/audit-verifier build on Node 22 | Pass; frontend 27.95 seconds | `build.log.gz` |

The three main passing test selections are disjoint: **250 tests in 19 suites**.
`supplemental-navigation.log.gz` records the worker's separate 114-test run;
it overlaps the main selection and is not added to that total.

`projectDestinationShell.test.tsx` uses the real shell, history and validated
action bus, with surface content/network stubbed. It covers copied URLs with
and without a project, StrictMode delivery once, query/hash preservation,
imperative navigation from Projects and project home, later user filter choices,
and preservation of the selected project step. Native proof covers the actual
Projects handler and its live filtered read rather than the shell stub alone.

The native fixture signs up one fresh synthetic organization, logs in normally,
reads an available intake client and creates two 510(k) device projects and one
IND drug project through `POST /api/c2c/projects`. No selected project is required
for the MDX link. The canonical path is `/concept2cure/projects`, MDX is pressed,
the live `ws=MDX` request returns 200, two device cards are visible, and the drug
card is excluded. A manual Biotech choice survives search/clear rerenders. The
existing pathway proof still shows a one-row bounded response with `hasMore`
and a two-project complete count. Screenshot `mdx-alias-portfolio.png` and
`pathway-portfolio.png` were visually inspected/retained with synthetic names.

The app ran on the existing deploy-shaped local PostgreSQL as `app_service`,
non-superuser and `NOBYPASSRLS` (`native-role.txt`), with `RLS_ENFORCE=on` and
`LAUNCH_SCOPE_ENFORCE=on`. No provider call or credential was needed. Native
proof supplements the PGlite tests; it does not claim formal OQ execution.
No auth token, browser trace or private credential is included in this evidence.

## Result and limits

Only two production files change: the alias/action metadata in
`client/src/concept2cure/v2/registryModel.ts` and accurate MDX description in
`shared/navigation/index.ts`. There is no new filter owner, route, query, table,
surface, commercial grant, dependency or policy relaxation. AnA navigation,
locked-screen identities and mentions already use the same alias resolver;
their existing focused checks pass. Projects remains the owner of the filters
and intake wizard. Plain Projects navigation keeps its current behavior.

The separate device-workstream shell/target/catalogue remains for A2.10. This
change makes no claim that the rest of device-workstream parity is complete.
Existing MDX launch-policy test mismatches and pending formal OQ recorded in
A2.7 evidence are outside this alias change; they were not reclassified as green.
Next is A2.9, retiring uncalled project creators with canonical intake preserved.

Mandatory publication gates are enforced by `.husky/pre-push`, including the
TypeScript zero-error and no-new-lint-warning checks. No bypass is authorized.
The first push was correctly refused for one new `max-lines-per-function`
warning in the expanded shell test group (`push-lint-red.log.gz`). Splitting
MDX and dossier cases into separate describe groups removed the warning,
retaining all 30 assertions/tests (`routing-green.log.gz` and
`lint-correction.log.gz`). No lint baseline or rule changed.

## Combined-tree qualification

Production retains one MDX alias/action and the incoming accurate navigation
description. Shell tests preserve both versions' strongest assertions: bus reset,
actual filter values, no-project portfolio rerenders, exact canonical history,
and the selected project's step. The incoming admission/reachability test remains.
Both native flows remain: bounded 510(k)/drug pathway counts and the complementary
IVD-to-recorded-Plan journey, including selected-project URLs. An independent
read-only review found no material loss, duplicate runtime owner or scope widening.

The final union of the two selections passes **398 tests in 30 suites** (72.52
seconds), including portfolio parent/client/anchor SQL tests, navigation and
mentions, validated action/commit boundaries, Live Drive, existing guarded
intake, device workflow placement and incoming dossier/tracking parity.
`merged/test-files.txt` records the exact selection, and
`merged/regression.log.gz` records its result. The separate four-suite routing
selection also passes **36/36**, with zero lint errors and the sole existing
registry file-length warning (`merged/routing*.log.gz`). No warning limit grew.

Both native flows pass together in **22.0 seconds**, using two fresh synthetic
organizations, canonical creation and the same non-bypass runtime role.
`merged/browser.log.gz`, two selected JSON results and four screenshots record
the actual scoped MDX reads, preserved query/hash/program, manual filter choices,
bounded counts and the reachable IVD analytical-performance Plan work package.
Screenshots were inspected. The merged production client/server/audit-verifier
build passes (frontend **26.27 seconds**, `merged/build.log.gz`).
`merged/source-proof.json` pins both merge parents and the exact qualified
production/test file hashes. These combined results supersede neither historical
red nor pre-merge qualification; each remains attributed to its own snapshot.

The Projects filter retains its existing view-local lifetime. Reloading the
canonical Projects URL uses ordinary defaults; revisiting the legacy MDX URL
applies MDX once. This change introduces no filter persistence store.

## Concurrent editor-context integration

All publication gates, including full TypeScript with zero errors, passed on
`af20a0e85`; the remote advanced during that check and refused its stale ref.
`merged/gates-ref-race.log.gz` retains both the successful gates and refusal.
No forced push or gate bypass was used. Concurrent editor saved-section context
work through `28d129756` was merged as `4417929f1`, alongside its metadata/logging
fixes. Read-only review found no MDX/navigation overlap and retained request-client
access, saved-section identity and template/drafting refusals.

All eight qualified A2.8 source/test hashes remain byte-identical. On this further
combined tree, **112 tests in nine suites** pass: both saved-section HTTP/PGlite
paths, reader/prompt/turn/outline context, template safeguards, the MDX real shell
and AnA navigation. These overlap earlier selections and are not added to the
398-test total. The production client/server/audit-verifier build passes again
(frontend **23.91 seconds**). `merged/editor-*.log.gz` records these results.
Normal publication gates run again on the final commit.
