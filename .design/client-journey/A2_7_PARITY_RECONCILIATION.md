# A2.7 dossier parity reconciliation

## What already exists

The inventory in `docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.7/README.md`
was checked against code before implementation. Three reads must not be conflated:

1. `server/services/c2c/dossier-read.ts` / `ProjectDossier.tsx`: governed
   `c2c_document_sections`, one home filing figure, separate added-market figures.
2. `server/routes/dossier-readiness.ts` / `Dossier.tsx`: per-section
   `concept2cure_artifacts` counts, weakest-artifact state and section dates.
3. `server/services/dossier/dossier-map-view-assembler.ts` /
   `dossier-map.routes.ts` / `DossierMap.tsx`: legacy `project_sections` tracking
   modules, their actual completion percentages and section labels.

`program-project-anchor.ts` already resolves a program UUID to the same-org,
active PM project. `programInOrganization`, `requestDb` and `requestPgClient`
already enforce the request's program and database boundaries. Vault already
owns the editable tree. Routing already owns URL aliases, action handoffs,
project-step state and the open-project door. Extend those owners.

The A2.6 handoff's suggestion that the map also used artifact rollups was
imprecise: its source is `project_sections`. This reconciliation corrects that
claim before any deletion; no record or capability is dropped on that basis.

## Boundary and sequence

Preserve artifact and tracked-section information as explicitly labelled,
read-only supporting detail in Author, with their own data basis and states.
They must not alter or impersonate the governed home dossier figure. Reuse
their existing read/assembly logic under request scope, with an exact PM-anchor
bridge, honest absence/failure and AnA facts. Show artifact counts and section
dates, and the tracking module/section view, before folding their screens.

Then apply SLICE_A2_PLAN A2.7: string aliases plus existing stage actions,
project-required destinations through the open-project door, canonical URL
replacement, and the dossier screen/route/catalog/capability residue cleanup.
Keep stored data and other readers. Amend the catalog-creating migration in
place, without cascading deletes. Update the existing validation package.

## Agreed contract

The current dossier router already installs `CurrentProgramAccess` with a
strict, accepted program/PM-project/client-workspace relationship. Reuse that
anchor and revalidate the exact accepted relationship before returning. An
unanchored or ambiguous program remains the existing canonical 409 response;
do not replace it with empty supporting records or a second bridge lookup.

After the concurrent A2.7a convergence below, the response has one top-level
`artifactReadiness` using the shared governed-artifact type, plus optional
`supportingReadiness.sectionTracking`. Artifact states are measured,
no_artifacts, unavailable or unanchored; unknown statuses are not_assessed.
Tracking is read with actual records or unavailable. Source failures carry
safe STORE_UNAVAILABLE / READ_FAILED codes/reasons and never impersonate empty
lists or alter the governed figure. Governed-read failures keep whole-read 500.

Artifact records retain CTD key, total/status counts, weakest status and section
date. Unknown statuses are `unknown`, with unknown counts and summary totals;
they never become locked. Mixed approved/locked artifacts are approved under
the existing stated weakest-artifact rule. Tracking retains the existing real
module percentage, label, tone and section labels, using a required request
executor instead of a shared pool. No additional readiness formula is added.

`destinationFor(id, projectOpen)` returns `{surfaceId, applies?}`. Alias strings
remain strings; a separate applies table uses the existing rail action type.
The original or canonical shared navigation target supplies project scope.
Project-required destinations with no selected project return Projects without
an action. Nav and URL loads use the same resolver and validated action bus;
canonical URL replacement preserves program query/hash and features' address.
URL project hydration must finish before a no-project redirect can be decided.

## Concurrent artifact carryover reconciliation

Remote `7d193063f` added overlapping A2.7a work while the publication hooks ran.
What already exists there: `services/c2c/dossier-artifact-read.ts` is the extracted
rollup reader; `shared/types/dossier-artifact-readiness.ts` owns weakest-state and
summary rules; `ProjectArtifactReadiness.tsx` validates semantic counts/dates and
renders their artifact view. It uses measured/no_artifacts/not_assessed states
and a top-level `artifactReadiness` response. Its tests add scope and malformed
response checks. Reuse these stronger shared owners rather than publish two
readers, formula implementations, wire bases or artifact tables.

Merge contract: top-level `artifactReadiness` uses that shared type and component.
`supportingReadiness.sectionTracking` keeps the existing tracking map. Read the
artifact source once through the accepted request/anchor/client scope; retain
pre/post currentness checks and independent failure states. Retire our overlapping
`services/dossier/artifact-readiness.ts` extraction, move any stronger scope
predicates into the canonical reader, and keep the old HTTP route retired.
AnA facts contain one artifact source and one tracking source. Preserve all new
upstream semantic-validation and access tests while updating superseded wire
expectations. A2.7 remains complete only when the combined tree is verified.

## Concurrent A2.7b integration — current merged contract

This section supersedes the narrower tracking shape and earlier artifact
`unknown` wording above. It preserves the incoming A2.7 fold and A2.7b's
stronger recorded-data safeguards in one composition. The combined checks below
qualify this final contract; older records above qualify their own snapshots.

- Exactly one top-level `artifactReadiness` uses the canonical governed-artifact
  reader/type/component. Unsupported artifact states are `not_assessed`, never
  `locked`; the shared weakest-state and summary rules remain authoritative.
- Exactly one `supportingReadiness.sectionTracking` uses
  `DossierSectionTracking`, with `basis: 'section_tracking'` and explicit
  `measured`, `no_sections`, `unavailable` or `unanchored` state. No top-level
  parallel tracking payload, extra query, second renderer or readiness mean is
  retained.
- Successful tracking preserves raw stored code identity, title, selected raw
  status, observed duplicate statuses and section labels. Known duplicates use
  deterministic existing advancement rules; a raw alias remains its own record.
  Any unknown or missing observation withholds the affected module's percentage
  and tone (`null`), rather than becoming a measured zero or complete result.
  Unclassifiable/mismatched code/module rows remain visible as `unmapped`.
- Existing canonical shared rules validate labels, placement, status selection,
  module counts and figures in both server and client. Missing, malformed or
  contradictory payloads are unavailable to the screen and AnA. Literal signed
  states remain distinct from approved and locked states.
- Each source uses the same request executor and exact admitted program/project/
  client relationship. Strong accepted-mapping SQL predicates and closing
  currentness checks remain. Supporting-source schema/query failures return
  explicit unavailable records with safe fixed reasons and optional
  `STORE_UNAVAILABLE` / `READ_FAILED` codes. A failed actor/anchor/current-scope
  check refuses the whole response; no failure selects a new source or anchor.

The incoming dossier screen/HTTP route/registry/catalog/capability retirement,
step-aware aliases, no-project chooser, canonical history behavior and revised
validation package remain in place. Stored records, subscriptions, signatures
and dispatch safeguards remain. A2.7b's legacy compatibility-state tests qualify
its earlier pre-fold snapshot; the merged product reaches the data through core
Author and treats the old HTTP endpoints as retired.

The A2.7 and A2.7b test/build/native records qualify their respective snapshots.
In particular, A2.7b's 163 tests in 14 files and native 31.4-second flow are
pre-merge evidence. The combined tree passed 294 tests in 27 files, both native
URL/artifact/tracking flows and the production build. The focused server resolution
passed 59 tests in five files. Proof is under `slice-A2/A2.7b/merged/`; required
publication gates still apply. A2.8 (the existing MDX alias to filtered Projects) is next; device-workstream
remains until its separate A2.10 parity work.
