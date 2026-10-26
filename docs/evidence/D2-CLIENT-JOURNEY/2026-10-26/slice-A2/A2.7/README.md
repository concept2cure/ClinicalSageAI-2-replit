# A2.7 — project destinations and dossier function parity

Workstream: D2 client journey. Canonical branch: `concept2cure-v2`.
Starting commit: `5e7e36ca1f08c5abcf4c37a04893dee93dae2e73`.

## What already exists

- `ProjectDossier.tsx` and `server/services/c2c/dossier-read.ts` own the
  governed-document readiness read on Project home's Author step. A2.6 added
  counted section status, module update times and AnA facts; these are not
  the old artifact rollups or section-tracking read.
- `surfaces/Dossier.tsx` and `server/routes/dossier-readiness.ts` display
  `concept2cure_artifacts` per-section artifact counts, status counts,
  weakest-artifact status, section update dates, totals and AnA facts. The
  route accepts numeric project IDs and currently uses the pool directly.
- `surfaces/DossierMap.tsx`, `server/routes/dossier-map.routes.ts` and
  `services/dossier/dossier-map-view-assembler.ts` display `project_sections`
  tracking labels and real module completeness. This is a third data basis,
  distinct from both artifacts and governed-document sections. The map's
  UUID-to-PM-project bridge already uses `resolveProgramProjectAnchor` and
  `programInOrganization`; an absent anchor is explicit.
- `project-vault` and ProjectFilesPanel already own the editable file tree;
  no second tree or editing service belongs on Author.
- `registryModel.ts` owns string-valued `DEEP_LINK_ALIASES`; `routing.ts`
  resolves URL aliases, while `V2App.tsx` navigation writes bare destinations.
  `surfaceActions.ts`, `shellProject.ts`, the existing project stage action
  and the navigation target registry already own their respective handoffs.
  Alias resolution does not yet carry a stage or the no-project rule.
- Existing route, assembler/PGlite, shell-routing and project-home tests,
  validation OQ-SUBC-10 and the catalog reconciliation migration name the
  former surfaces. A fold must update their actual replacements together.
- Deleted-history search covers dossier, readiness, routing and editor/canvas
  names. Prior consolidation is evidence to preserve the existing owners,
  not a reason to rebuild a parallel service.

## Implementation boundary

First reconcile all three recorded data bases and preserve their reachable
read-only functions and safeguards in the core workflow. AnA facts alone are
insufficient. Do not substitute a governed-section figure for an artifact or
tracking count. Reuse the existing readers and PM-anchor bridge with request
scope; unavailable, failed and unanchored reads must remain explicit.

Only after parity is proved may the plan's dossier aliases, standalone screen
fold, route/catalog/capability cleanup and validation updates proceed. No new
store, dependency, editing tree, grant or standalone navigation identity.

## Completed change

The three reads are reconciled in
`.design/client-journey/A2_7_PARITY_RECONCILIATION.md`. The existing canonical
dossier route now carries independently labelled artifact readiness and section
tracking alongside governed document readiness. It uses the request client,
the access guard's already accepted PM anchor/client relationship, and an exact
currentness recheck before returning. No request database means no pool fallback.
Missing-schema, failed and absent data remain distinct; canonical anchor admission
still refuses unresolved/ambiguous relationships. The GET path is autocommit;
a supporting query failure does not poison another branch's transaction.

Artifact counts, status counts, per-section dates and totals are visible in
Author and supplied to AnA. The stated weakest-artifact rule now correctly
keeps approved+locked at approved; unrecognized states remain unknown and cannot
make a section ready. The existing tracking assembler and its formula/section
labels survive as an internal reader with a required request executor. Supporting
records never change the governed home/market figure. Vault keeps the editable tree.

String aliases remain string-valued. `destinationFor` supplies the existing
Author stage action and the project-required fallback to Projects. URL and nav
handoffs use the same resolver and validated action bus; canonical replacement
preserves query/hash and applies once. Copied project URLs hydrate before scope
is decided. `/features`, Back, reload and later step choices retain their behavior.
Project home's no-project state now uses the existing choose/create action.

The old dossier screens, HTTP mounts/routes and registry residues are folded.
Their outcome tests are carried to the canonical hook/screen and route; actual
assembler/SQL tests remain. Catalog rows are deprecated in place, not deleted;
both the creating catalog migration and its packaging migration omit these
identities. The latter is necessary for the fresh-install unknown-module guard.
The capability seeder writes the old mapping identity inactive on every boot,
including existing installs. Old suggested actions and navigation examples are
removed; the AnA manifest is regenerated. Shared CSS consumers remain intact.
The surface-context count drops by exactly the two deleted publisher IDs, with
no additional blind surface/exemption. No stored artifacts, sections, project
data, subscription, signature or dispatch safeguard is removed.

## Validation

The following are overlapping checks, not a summed unique test count.

- Backend: 6 new failures before implementation; **34 passed in 5 suites**,
  including real-SQL governed/supporting/tracking tests and the marketing journey.
  Scope, stale actor/anchor/client refusal, missing request DB, independent schema
  and query failures, and weakest/unknown states are covered. See [backend.md](backend.md).
- Client parity: 6 failures before implementation; no-project action failed
  before wiring; **43 passed in 4 suites** after carrying the visible table,
  dates, totals, tracking view and AnA facts. Unknown-status fixture totals were
  corrected to remain internally coherent after independent review.
- Routing: 6 failures before the resolver; **151 passed in 15 suites**, including
  6 real-shell cases for hydration, StrictMode one-shot action, canonical history,
  Back, reload and features. Existing navigation scanner exposed an unrelated
  local `open(mode)` helper mistaken for navigation; its three occurrences were
  renamed `openAssignment` without changing behavior or weakening the scanner.
- Capability/catalog: both negative checks failed first; **17 passed in 2 suites**.
  The real-SQL catalog writer replay exposed and then verified the packaging
  reference correction. Native PostgreSQL replay of both writers **twice** keeps
  both old rows deprecated and the old capability inactive, with no cascading delete.
- Native browser, runtime role `app_service` with enforcing RLS: a fresh human
  wizard creates the exact project/anchor; a real artifact POST creates its draft.
  Both legacy URLs reach Author, no-project URL reaches Projects, the artifact's
  counts/status/date and tracked labels/percentage render, the governed figure
  stays unchanged, reload retains Evidence, and another org receives **404**.
  **1 passed in 22.9 seconds**. Two existing filing-question and template/editor/
  Vault-return flows also pass together (**28.3 seconds**).
  The older tracking initialization API refused the fresh user's write (403).
  It was not widened: two clearly synthetic historical tracking rows were seeded
  only in local `concept_handoff` through an explicit fixture connection, then
  served through the normal scoped application role. The test rejects any other
  host/database and does not silently skip missing fixture setup. Earlier browser
  attempts caught a Home-versus-Projects heading assumption and that writer refusal;
  auth fixture token naming was corrected from the actual signup contract.
- Production client/server/audit-verifier build passed; Vite **27.43 seconds**,
  with the existing chunk-size warning. Context, CSS, alias and retirement checks pass.
- Full TypeScript zero-baseline check and all mandatory pre-push gates are
  required for publication; no bypass or type/lint baseline expansion is used.
  The full pre-integration TypeScript run passed with **zero errors**.
  The first push's SQL guard rejected interpolation of the tracking reader's
  fixed optional clause. It was replaced by two fixed parameterized query
  forms, without a scanner exception. The SQL gate passes and all **34 backend
  tests** pass again; accepted anchor/client predicates and bound values remain.
  The post-correction client/server/audit-verifier build also passes (Vite
  **21.80 seconds**).

## Concurrent integration

Merged SCIM setup/audit changes through `4334c3fc0` without source conflicts.
The combined dossier/routing and SCIM UI/refusal/atomicity suites pass:
**56 tests in 7 suites**. The merged client/server/audit-verifier build also
passes (Vite **23.99 seconds**). Mandatory publication hooks check the final
combined tree again. No SCIM credential value is included in these records.

## Known baseline and qualification limits

The broader middleware launch-scope suite still has five MDX policy/expectation
mismatches. An isolated immutable HEAD registry/deferred snapshot reproduces
the **same 5 failures / 37 passes**; source hashes and raw output are recorded.
No MDX admission or expectation was changed to hide them. Focused current
retired-route checks pass: both old endpoints are refused under explicit
production enforcement. The new retired-route assertion fails against the old
registry and passes against the current one (**25 focused scope tests pass**).

The validation package names the new canonical path as **URS-SUBC-009a**;
historical 009/results remain intact. Revised formal OQ-SUBC-10 v0.7 has not
been executed or signed. The SQL/HTTP/browser checks above are supplemental
proof, not a formal OQ pass. TM-001 was regenerated against the explicitly
selected 2026-09-27 historical result set: **69 pass, 2 partial, 45 uncovered**,
with **zero integrity problems**. The new requirement remains uncovered.
Regeneration exposed 31 pre-existing missing RA rows; their already recorded
risks and scripted/credentialed activities were transcribed from URS/OQ sources,
without new CMC admission or execution claims. The matrix generator's negative
and positive self-tests pass. VSR-001 documents the impact and these limits.

Compressed logs, safe native result JSON and screenshots are beside this file.
No auth traces, token values or real customer data are included.

## Next

A2.8: route the existing MDX alias to Projects using the existing device filter.
The device-workstream screen remains until A2.10's separate parity work.
