# D2 client journey: Slice A.2 Projects

Starting point: `b3661f72dd2130bf22ceae6c1b428d8a16b93b71`, canonical branch `concept2cure-v2`.
Plan: `.design/client-journey/SLICE_A2_PLAN.md`, rechecked against current code before each sub-slice.

## What already exists

- `client/src/concept2cure/v2/shellProject.ts` owns the open project, URL identity, per-tab mirror and visit guards. It does not remember a lifecycle step; `ProjectHome.tsx` keeps that step in component state and loses it on remount. Existing shell and project-home tests cover identity and default steps. No related step-persistence implementation was found in deleted history.
- `server/routes/c2c/projects.ts` provides the canonical project creator, program detail and paged portfolio read. GET and the create response duplicate the card projection. The anchor already holds `client_workspace_id`; the portfolio omits it.
- `server/services/c2c/current-program-access.ts` and `program-project-anchor.ts` establish current program/anchor access before reads. Any portfolio filter/count must retain that boundary and its final current-access check.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` already provides the wizard, workstream/status/search controls and readiness mean; `shared/navigation/surface-actions.ts` owns surface-action contracts.
- `projectDoors.ts`, the MDX Overview and `useMdxPrograms.ts` already provide the device navigation and portfolio. These are completed or converged, not replaced.

Discovery commands: `rg` across shell step, project creation/list/readiness, client workspace, pathway and alias implementations; `git log --all --diff-filter=D` over the related shell/project files. The plan's detailed inventory remains the reference; individual entries below record corrections and verification limits. Founder-gated admissions and parity-dependent folds retain their guards.

## A2.1: remember the project's selected step

Completed: a validated step is preserved in the existing per-tab shell-project channel. Same-project republishing preserves it; different-project visits, tenant clear and mismatched URL restores do not carry it. ProjectHome subscribes to that channel and remembers both a person's choice and the initial empty-project Plan default. Explicit Tasks handoff > pending surface action > remembered step > first-open default. Invalid stored steps are discarded. No new store, route or global key.

Red: 12/15 new unit/component cases failed before implementation, including the actual TopBar chip returning Author after a template copy. The focused browser test independently failed for the same expected Plan/received Author assertion after real signup, wizard creation and template creation (`A2.1/browser-red.txt`).

Green: 15/15 new cases, 74/74 existing cases across eight shell/project/navigation suites, and the focused real-browser flow pass. The browser verifies Plan after the chip, one started document in the filing plan, Plan after reload, and Evidence after Vault→chip (`A2.1/browser-green.txt`, `A2.1/returned-plan.png`). This used the isolated deploy-shaped PostgreSQL database as `app_service` with `RLS_ENFORCE=on`, development-only `ALLOW_DEV_AUTH=1`, and no AI provider. The golden first-session journey now asserts the remembered Plan after Home's project-card return; that longer fixture-dependent journey was not rerun as a whole.

Scoped ESLint: zero errors, existing warnings only. First-open defaults, bare-workId Review fallback and pending-action precedence remain covered. Source: `shellProject.ts`, `ProjectHome.tsx`; proof: `shellProjectStep.test.ts`, `projectHomeStepReturn.test.tsx`, `project-step-return.e2e.ts`.

## A2.2: the owning client in one portfolio projection

Completed the existing GET/201 card projection in `server/services/c2c/project-portfolio.ts`; both callers now carry `client_workspace_id` and `client_name`. Project detail uses its already admitted exact anchor and exposes the same client identity. Project home labels this fact **Client**, leaving the regulatory applicant sponsor concept in its existing forms. No schema or dependency changes were needed.

The list accepts a strict positive-int32 `clientWorkspaceId`, verifies tenant ownership and applies it in SQL before paging. `meta.count` retains its existing page-length meaning. `meta.clients` carries only `{id,name}` from active workspaces attached to currently accessible programs, independently of the current page/filter. It is sorted and bounded to 200 with `clientsHasMore` rather than silently presented as complete. The selector names that limit when applicable. No organization-wide client directory is fetched by this filter.

The canonical program scope retains frozen accepted anchor/client mappings in its existing private WeakMap. Its asserted accessor refuses a fabricated or different-executor scope. Final list revalidation compares those mappings as well as program IDs/actor identity, so a reassociation during a read cannot serve earlier private metadata. The detail route retains its existing initial-parent-admission contract; post-read detail access revalidation was not added in this sub-slice.

The existing `projects.filter` surface action now accepts an authorized client id or `all`, and refuses unknown client choices before changing any other filter. Read errors remain errors, an empty filtered result names the client filter, and the selection can be cleared after a failed read. Workstream/status/search behavior remains unchanged; server pathway counts and their UI belong to A2.3.

The small `ProjectClientFilter.tsx` helper holds the filter's rendering and context formatting. Projects retained its existing seven lint warnings; neither the new helper nor tests add warnings. After that extraction, the four directly affected portfolio suites pass 19/19; the client browser flow and production build are rerun on the final helper.

Red evidence: the new client UI cases failed without the selector/action; the Client fact test failed while the header showed the CRO organization's name as Sponsor; real browser creation returned no `client_workspace_id` in the 201 card before the server restart onto this change. The filed backend red artifact is a partially fixed run: eleven failures on missing fields/filtering/metadata and one passing, already-fixed reanchor case. A separate controlled mutation removes only the anchor comparison from final revalidation; that reanchor test fails (expected 503, received 200), then passes after restoring the implementation. See `A2.2/*red*` and `reanchor-restored-green.txt`.

Green evidence:
- 312/312 backend tests across 20 existing/new Projects suites. This includes real PGlite SQL with 60 programs, multi-page filtering, foreign/malformed client refusal, private/inactive metadata exclusion, reanchor detection, immutable scope provenance, bounded choices and actual POST/GET card-key parity. PGlite is not a claim of native runtime-role RLS.
- 59/59 client tests across eight portfolio/navigation suites, including all six new filter cases and the new Client fact case. These are overlapping targeted suites, not a full-suite count.
- Both focused browser tests pass together (38.4 seconds), using fresh signup, real creators, `app_service`, and RLS on. The client test creates two workspaces/projects, filters to one in the UI, opens its home and verifies the owning Client, then checks the paged API's minimal client options. `client-filter-result.json` and screenshots contain synthetic records only.
- Production build passed: frontend, server and audit verifier. Existing chunk-size notices remain; no new runtime dependency was added.

The broader backend run initially found a taxonomy fixture that omitted the existing strict workspace-lock row before the anchor result. Corrected only that queued fixture, retained the strict check, then verified the taxonomy suite and the full affected backend set green. SQL interpolation allowances decreased for `projects.ts` from six to four; no allowance was added for the shared helper.

## A2.3 — pathway filters, scoped counts and device readiness

Completed the shared pathway classifier and its SQL projection, server filtering
and scoped counts, the existing Projects chips/action/context, and null device
readiness. IDE/regional/Other rows remain visible. Explicit recorded progress is
preserved separately from readiness. Full evidence, red checks, review findings
and limits are in [A2.3/README.md](A2.3/README.md). No schema or dependency changed.

## A2.4 — all admitted creation doors reach the wizard

Completed the existing surface action/bus and Projects wizard opener; Home,
Onboarding and device doors now use it. Retired the separate AnA command writer
and made stale commands fail honestly without a write or proposal. The person
still reviews intake and presses Create. Replacement paths, red proof, SQL/HTTP
refusal checks and native browser evidence are in [A2.4/README.md](A2.4/README.md).
Existing-project configuration, catalog and entitlements remain unchanged.

## A2.5 — selected filing guidance and shared Ask AnA prompt

Completed the existing picker note with catalog reference wording and server
build facts, description search and the catalog's shared Ask AnA question.
The actor-bound wizard now reports its actual step and public selection through
the parent's single context publisher. Detailed red/green evidence, private-field
limits and native browser checks are in [A2.5/README.md](A2.5/README.md).

## Remaining sequence

A2.6 is complete: counted section details and regulatory order extend the existing read; Author shows read-only status and module dates, home review/draft totals, and the critical-path AnA handoff. Evidence is in [A2.6/README.md](A2.6/README.md). [A2.7a/README.md](A2.7a/README.md) records the artifact-rollup/count/date carryover, and [A2.7b/README.md](A2.7b/README.md) records the separate tracking-record carryover into Author. A2.7's aliases and coordinated retirement are next. Later folds retain founder-decision prerequisites. A2.4 retired the separate AnA creator in favor of the tested canonical wizard; no catalog row, feature entitlement or surface was retired.

## Final integration

Merged concurrent work through `e632a364eed588973b8e310076a0a3555f179483`, preserving its editor/source-ownership and regulatory fixes. No source conflicts occurred. The same-project step update retains the existing visit revision/identity used by source-owner guards; a changed project still retires that visit.

On the merged tree: 161/161 selected tests across nine step/editor/source-ownership/portfolio suites passed, both focused real-server browser flows passed together (31.8 seconds), and the production frontend/server/audit-verifier build passed (30.55 seconds). All pre-push gates passed, including no increased per-file lint warning count and the full TypeScript check with zero errors. A test double was corrected to use a distinct, correctly typed executor object with the same query method; the provenance rejection assertion is retained. No type or lint baseline was expanded. Logs are under `integration/`.

The first push met a newer remote head, `133de1428`, containing qualified assembly-queue completion and S4 regulatory fixes. Merged that head without source conflicts and rechecked the directly interacting ProjectHome return, assembly queue completion and workbench assembly suites: 53/53 pass (`integration/second-merge-related.txt.gz`). The broader browser/build qualification above belongs to the preceding `e632a364e` merge; pre-push checks also run on the final combined tree.
