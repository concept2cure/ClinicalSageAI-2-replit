# A2.7b — reach recorded section tracking from Author

D2 client journey on `concept2cure-v2`, starting at `7d193063`. Continue the
accepted direction: specialist functions belong in core project workflows,
using their existing records, engines and safeguards.

## What already exists

- `server/services/dossier/dossier-map-view-assembler.ts` already reads the
  selected integer project's `project_sections`, joined to its parent project
  with both organisation predicates and archived-project exclusion. It groups
  modules and distinct section codes, retains the most advanced known tracking
  state, counts approved/signed/locked, and orders codes with the shared
  regulatory comparator. Reuse this implementation rather than introduce
  another tracking engine or copy its reference module labels.
- `server/routes/dossier-map.routes.ts` exposes that read to the old
  `client/src/concept2cure/v2/surfaces/DossierMap.tsx`. The old screen shows
  module percentages and section labels and publishes them to AnA. The legacy
  response collapses a missing store into an empty result; its digit-substring
  module parsing and unknown-state handling need an explicit boundary when
  these facts reach core.
- `server/routes/c2c/projects.ts` already composes the project's governed
  document sections and artifact lifecycle facts under a verified current
  actor and exact project anchor, revalidating that scope before returning.
  Extend this response with the existing tracking source using that same
  admitted executor/anchor. Preserve unresolved-parent admission and all
  project-sharing checks.
- `surfaces/ProjectDossier.tsx` already renders module completion and artifact
  status in Author and publishes `dossierFacts`. Tracking records are a
  separate source with a different completion set; neither the artifact
  states nor governed document sections can substitute for them.
- `shared/regulatory/section-code.ts` owns code normalization and regulatory
  ordering. Existing assembler PGlite, legacy route, canonical dossier,
  project-detail and native browser tests provide the fixtures to extend.
- Searches cover dossier/map, section tracking, program admission, status
  vocabulary, caller/route owners and deletion history. No alternative owner
  was found in the available shallow deletion history; full-history absence
  is not established.

## Completed pre-merge change and boundary

Reach the recorded tracking modules and section labels/states in a labelled,
read-only Author panel and AnA facts. Keep the server's module completion
figures and distinct approved/signed/locked rule. Do not pool or average them
with document-section or artifact measures. Unknown, malformed, missing and
failed reads cannot become a ready or empty-looking tracking result.

No new app identity, route, store, migration, commercial grant, provider call
or document mutation is added. Legacy screens, routes, capabilities and
validation inventory remain until the coordinated A2.7 routing/fold step.

## Verification

- Client baseline: **17 failed** cases for missing tracking facts and the
  Author panel. Review then reproduced contradictory section/module labels,
  placement reasons and compatibility empty states: **6 failed / 21 passed**
  in the combined red. These cases now pass using the shared source rules.
- Canonical route baseline: **4 failed / 7 passed**. Confirmed legacy baseline:
  **3 failed / 15 skipped**, covering unknown stage, unknown duplicate and
  incidental module digits. Raw alias identity remains covered separately.
- Final server scope/read regression: **50 passed in 4 files**, including real
  SQL with signed records, raw aliases, deterministic known duplicates, unknown
  duplicate observations, unmapped data, archived/sibling/foreign exclusion,
  missing stores and exact anchor/access revalidation after the tracking read.
- Final combined regression: **163 passed in 14 files**. It covers the existing
  governed/document and artifact reads, project/legacy scope, editor handoffs,
  step return, loading/error/retry states and both tracking views.
- Native PostgreSQL 16/pgvector was provisioned through the repository's fresh
  and deploy paths. The development browser uses `app_service` with RLS on and
  the explicit local dev-auth setting. This proves UI/data-scope behavior, not
  production authentication or IQ/OQ/release certification.
- Native browser: fresh sign-up and IND project creation; actual artifact
  writes and review; initialize saved tracking rows through the existing API;
  advance one section through drafting and internal review; compare the old map
  response to the new typed core response; verify labels, raw codes and states
  after reload on Author. Both document-section figures and artifact facts
  retain their own basis. Desktop/mobile views have no document-wide overflow.
  Critical-path question prefill still causes **0 model requests / 0 dossier
  writes after the question**. The complete flow passed in 31.4 seconds.
- Independent read-only review passed after label/placement and compatibility
  corrections. Production client/server/audit-verifier build passed. Scoped
  lint has zero errors and only existing warnings after small helper/test
  refactors. Normal zero-baseline TypeScript and pre-push gates run before
  publication; no baseline expansion or hook bypass is used.

Screenshots and selected result JSON contain synthetic data only. Runtime/auth
traces are excluded. Raw test/build logs are compressed beside this file.

## Concurrent A2.7 fold — current boundary and contract

The incoming A2.7 fold now supplies the coordinated aliases, registry, HTTP
route, catalogue, capability and validation-package retirement described as
next work at the pre-merge checkpoint. The old dossier screens and endpoints
are retired; their stored records remain reachable through core Author. This
supersedes the earlier carryover-only boundary without discarding its evidence
or raw-record safeguards.

The merged response keeps exactly one typed
`supportingReadiness.sectionTracking`, using the A2.7b source basis/read states,
raw code/title/status and observed duplicate statuses, deterministic known
selection, null dependent figures for unknown observations, and visible
unmapped rows. Top-level `artifactReadiness` remains the canonical artifact
owner and uses `not_assessed` for unknown artifact states. One shared rule set
validates labels, placement and figures before the screen or AnA receives them.
There is no second tracking wire field, query, renderer or client mean.

All sources retain the same exact admitted request/program/project/client
relationship and final currentness checks. Supporting-source failures remain
explicit unavailable states with safe fixed reasons and optional
`STORE_UNAVAILABLE` / `READ_FAILED` codes; a failed closing scope check refuses
the whole response. The legacy compatibility tests above qualify the pre-fold
snapshot; merged retirement and canonical URL behavior use A2.7's replacements.

The 163-test, native, lint and build results above qualify the A2.7b pre-merge
snapshot, not the combined tree. Incoming A2.7's qualification is preserved in
its adjacent README. Combined qualification is recorded separately below.

## Combined-tree qualification (2026-10-26)

The resolved integration of `1744fa0c` and incoming `2fd07ac8` passed **294 tests
across 27 files** (71.95 seconds), including canonical admission, exact mapping
changes, membership revocation, request-role supporting reads, typed tracking,
artifact parity, legacy destinations, shell reachability and catalogue retirement.
The focused server resolution also passed **59 tests across five files**.
An independent read-only source review found no material merge regression.

The two native Chromium flows both passed (53.35 seconds) on a newly provisioned
local `concept_handoff` database. Application reads used `app_service` with RLS
on. Fresh synthetic sign-ups created IND projects through the real wizard;
artifacts were created/reviewed through their governed API. The shared
`tests/e2e/dossierTrackingFixture.ts` seeded only explicit historical tracking
rows for each newly created exact anchor/program, through a local-only fixture
connection. No retired tracking write endpoint was restored or used.

The flows proved old `dossier`/`dossier-map` page links reach Author with project,
query and hash preserved; a no-project link reaches Projects; Evidence survives
reload; another organisation receives **404**. The canonical response and screen
preserve separate `2.5` and `m2.5` records and signed status. Document figures
stay unchanged. Tracking and artifact views were checked at 1440px and 390px
without document-wide overflow. Critical-path prefill made **zero model requests
and zero dossier writes** after the question. Selected result JSON and screenshots
are under `merged/`; runtime and auth logs are excluded.

The production client, server and audit-verifier build passed. Scoped ESLint
reported zero errors and four existing size/complexity warnings. The full
repository TypeScript gate passed with **zero errors against the unchanged zero
baseline** (`merged/typecheck.log.gz`). Normal publication hooks also check the
final committed tree; no bypass or baseline expansion is used.
Source hashes identify the checked merged files. The local browser's explicit
development authentication and historical fixtures qualify this UI/data-scope
flow, not production authentication, the unrelated unavailable Skills read, or
formal OQ-SUBC-10 v0.7 execution/sign-off. The existing MDX launch-gate baseline
mismatches remain separately recorded in A2.7's evidence; these checks do not
relabel them as passing.

## Next

After merged qualification, A2.8 routes the existing MDX alias to Projects with
its existing device filter. Device-workstream stays until its separate A2.10
parity work; no new app identity or source is needed.
