# Project Data Room selected-source repair

F1 / W1 / D2, starting at `5a552f142`. The bounded source-selection repair is
implemented and focused checks pass; runtime/publication status is recorded below.

## What already exists

`ProjectHome.tsx` owns the Data Room and its selected-source AnA/editor actions.
At the baseline it intersects pins with every visible response and resolves selections
only from those rows. `projectSources.ts` owns the same read's URL/page and
grounding predicate. `SourceAssemblyDialog.tsx` is the existing source-driven
start for the single editor; it keeps its five-source limit. The current AnA
explicit handoff keeps its twenty-source ceiling and existing cross-surface pin
channel; automatic newest-source fallback stays at ten.

The existing project sources GET in `server/routes/c2c/projects.ts` returns
`projectId`, source rows and paging metadata. `data-room-search.ts` owns parsing,
projection and final checks. The unchanged `source-read-access.ts` already
supports exact IDs with native/parent/object admission and current-scope rechecks.
Existing session, read-visit and project-visit helpers are the owners of retirement.

The published pre-edit audit is
`../2026-11-13-project-source-pin-read-audit/README.md`; the current contract,
search/deletion inventory and file split are
`.design/claude-convergence/F1-PROJECT-SOURCE-SELECTION-2026-11-14.md`.
No second selection channel, editor, route, service, table, provider or model
is added. Root alone runs jobs and publishes directly through normal hooks.

## Verification to retain

Record a real failing search/page selection case before source edits, then
preserve its native exit and source snapshot. Add server contract/admission
failures before repair. Current-source and adjacent positive/negative tests,
scoped lint, required compiler/gates, real browser observations and canonical
publication follow after actual execution. No live generation, model PQ,
scientific release or hosted Codespaces acceptance is claimed.

## Retained baseline failures

- `client-red.json` runs all three frozen new/extended suites before source edits:
  native exit 1, 98 failed / 47 passed, no input drift. Its name covers client,
  route and actual PGlite native-source tests. `red-inputs.json` and
  `red-source-snapshot.json.gz` retain those inputs. One pagination failure was
  an initial empty-search debounce race in the test; it was corrected without
  removing the selection assertion.
- `followup-red.json` proves that corrected pagination assertion fails with one
  selected source instead of two, and that a real membership revoked during
  awaited grading still receives HTTP 200 at baseline. Both fail, native exit 1,
  no drift. `chooser-refresh-red.json` records the missing fresh read on ordinary
  bearer refresh (one failure); three existing post-open chooser retirement
  controls pass. The follow-up source snapshot/manifest retain the revised tests.
- `baseline-browser.json` and `baseline-browser-observation.json` reproduce the
  actual defect on the normal local declared-image app serving `5a552f142`:
  select source 231, search source 230, select it; only one pin remains. Both
  real source reads return HTTP 200. Native browser exit 1, no production-input
  drift, no page errors or attempted mutation. The room has 15 actual sources;
  pagination is a separate component regression, not a fabricated live page.

Browser authoring attempts remain explicit: attempt 1 read the demo options
before they loaded; attempt 2 checked selection before the debounced search read
and falsely passed. Neither is acceptance. Attempt 3 correctly waited for the
searched response and failed on selection loss, but its manifest also included a
test independently being authored; the final baseline rerun pins production
inputs only and has no drift. The first two observation filenames collided
with the generic runner receipt filename; their captured native stdout and
harness snapshots remain, and the corrected observer writes a separate file.

The independent review also identified the final route response boundary after
best-effort grading, plus continuing ownership after the existing chooser opens.
Those controls were authored before production GO.

## Implementation and verification in progress

The existing Data Room now owns checked row/checksum snapshots across its
searched/paged responses. Its existing buttons use a fresh exact read before
the existing AnA channel or SourceAssemblyDialog; the dialog/target/receiver
production owners are unchanged. Pending reads require a mounted sender,
while delivered editor intent keeps its session/project/selection guards
through intentional navigation. Explicit observed withdrawals still retire
pins. The original checked digest is never replaced on a visible-row refresh.

The existing server route/parser/search now admit and project only the exact
IDs, validate the complete set/project, avoid Quality recapture and recheck
current access after usage/grading. The shared source-access implementation
is unchanged. Ordinary JSON responses carry no selection attestation.

Initial checks are retained, including their failures:

- `server-green.json`: 124 passed / 1 failed. The test observation window
  accidentally included its ordinary catalogue setup queries. The first
  correction then exposed that its broad SQL predicate also included the
  count projection (`server-native-final.json`: 40 passed / 1 failed).
  `server-native-corrected.json` passes 41/41 with setup excluded and the
  unchanged canonical admission SQL identified precisely. Exact-ID bindings,
  at-least-two admission reads and separate bounded projection assertions
  remain. Neither correction changes production or removes an assertion.
- `client-green.json`: 229 passed / 9 failed across ten suites. Seven fixtures
  needed TenantContext with their real synthetic account; one needed the exact
  response attestation; the no-extra-authoring-read control needed to compare
  against existing background project reads. Their workflow assertions remain.
  The pending-processing negative was corrected to unknown/unavailable text,
  preserving the shared rule that retained readable text stays usable.
- Initial lint had three new complexity warnings. Small factoring within the
  same existing owners removes them; `final-lint.json` and
  `final-lint-comparison.json` record zero errors and baseline/current warning
  counts of 6/6, 0/0, 3/3 and 0/0 for the four production files. No rules,
  warning baseline, shared helper or qualification gate changed.

`final-checks.json` passes 363/363 across fourteen client/server suites, with no
input or runner drift. The final explicit recovery increment is retained as
`recovery-red.json` (missing Clear selection, native exit 1) and
`recovery-final.json` (all five affected client suites pass, including visible
and off-page clear/pending-action retirement). The existing small-button action
clears local/global pins and invalidates the selected-set epoch. It dispatches
no work. `accepted-inputs.json`, `accepted-scoped-lint.json` and
`accepted-lint-comparison.json` pin the final source and preserve zero lint
errors/no warning growth. This yields 365 distinct passing focused/adjacent cases
across the retained runs; no whole-repository test pass is claimed.

Full compiler/normal push gates, real repaired browser flow and canonical
publication remain pending until their receipts are recorded.
