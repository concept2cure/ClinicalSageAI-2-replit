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

## Actual repaired local flow

`repaired-start.json` records initial normal startup in the existing declared-image
local verifier, native exit 0 in 31.7 seconds, serving merge `e24e26eab`.
The initial passing observer and screenshots are retained under `premerge-*`.
`merged-start.json` then passes normal startup in36.9s at `8e5c9140f`, preserving
the published CSR medical-writing work. `merged-runtime.json` confirms that
exact served commit, schema ready and capabilities seeded; `/readyz` is503 only
for `ana: no_provider`. This is local verification in the declared image, not
a hosted Codespace acceptance or live-model proof.
`repaired-browser.json` / `repaired-browser-observation.json` pass with no
source/runner drift. Actual Lumen Lead selects two native captured sources
across a real search, clears them deliberately, reselects both across searches,
and receives HTTP 200 for the complete exact selection. Both titles and original
SHA-256 values appear in the unchanged SourceAssemblyDialog. New document
opens the existing creation form inside the one editor with its two-source
notice. The captured screenshots show the existing layout and controls.

Two repaired-observer attempts are retained as `attempt-1-repaired-*` and
`attempt-2-repaired-*`. They reached the correct chooser and document start but
incorrectly treated editor presence joins/leaves, then its awareness heartbeat,
as document writes. The corrected observer allows only those three existing
presence operations and blocks every other non-GET/HEAD request after login.
The passing run has no blocked document/model write and no page errors; it does
not create, draft, amend, approve or submit a document. Existing live provider
configuration and wider qualification remain outside this repair.

Source commit is `edb756c2e`; the normal merge
preserves incoming collaboration, peer-message and gateway-account work, with
the accepted source/config hashes unchanged.

## Remaining downstream audit candidates

A separate read-only trace confirms existing actor/parent access, immutable
source IDs, upload-byte SHA-256, retained-text hash/disposition checks and stored
turn lineage. No checksum-substitution defect was identified. Two narrower
candidates still require their own reproduced RED before any repair or claim:

- `V2App.tsx` prefills the human's composer; `useAnaChat.ts` consumes bare source
  pins at the later send. ProjectHome's mounted owner clears changed-project
  pins, but a project change through unmount/remount may leave an earlier
  accessible project's pins for another project. Existing owner/reset paths and
  requested-project admission need an explicit remount/dispatch test.
- The existing native retained-source callback rechecks lifecycle/access at
  dispatch. Ordinary uploaded bytes and legacy retained-data excerpts appear
  to lack the same final callback after reading; test withdrawal/revocation
  between read and dispatch before changing the existing authority boundary.

These are static context/currentness findings, not runtime proof of unauthorized
disclosure. This packet's click-boundary and existing-editor pass does not claim
deferred AnA dispatch acceptance. The additional existing
`projectHomeDocuments.test.tsx` automatic-ten/newest fixture cases are being
reconciled with the fresh-read contract; its original failures are retained.

## Compiler and automatic-drafting compatibility follow-up

The first normal publication attempt (`publication-attempt-1.json`) is correctly
blocked: all89 CI lint-job gates pass, then the full compiler finds two test
typing errors. The synthetic user now supplies the actual required AuthUser
fields through a typed object; the unsupported `exact` role-query option is
removed. These compiler corrections add no cast-through-unknown, compiler/
baseline edit or bypass. The three older fixture adaptations retain their
explicit partial-account test casts; the focused owner tests use the complete
typed account and real session helpers.

The additional automatic-drafting test home has three old synchronous,
unauthenticated positives (`automatic-compatibility-before.json` has two actual
failures, `automatic-window-before.json` has the third). Its existing sign-in
helper is reused only for those cases; the same source-page fixture now returns
a complete exact attestation while preserving non-OK responses. Asynchronous
assertions keep the exact-ten/newest/no-editor expectations.
`compatibility-final.json` passes82/82, including all36 document tests and all46
selected-source tests, with no drift. Scoped lint passes. Combined with the
unchanged production and earlier adjacent suites,401 distinct cases pass in the
retained runs. This is still not a whole-repository test-suite claim.

`publication-attempt-2.json` records the corrected normal full compiler at
`8e5c9140f`: native tsc exit0, errors0/baseline0; all89 lint-job gates pass and
the full pre-push hook succeeds. The remote ref advances to `3692f44ad` during
those checks, so Git rejects the update without publishing it. This is the
first remote-ref race, distinct from the earlier compiler rejection. The next
ordinary merge preserves the newly published internal-audit task repair; no
forced update, hook bypass or baseline change is used.

`publication-attempt-3.json` records the next merged source `01b65c048`: full
compiler0/baseline0 and all89 lint gates pass again, but another normal ref race
occurs when the canonical collaboration-receipt repair reaches `cd407d470`.
The two source trees retain their own receipts; the selected-source inputs have
no drift. The coordination entry requests a15-minute publication window under
rule6, with no callable cross-session channel and no claimed pause of another
lane. Ordinary merging/pushing continues. The incoming native audit's raw log
EOF whitespace is preserved byte-for-byte; source/coordination whitespace checks
pass rather than rewriting another owner's recorded outputs.

Canonical publication remains pending until its native receipt is recorded.

The third reference race (`publication-attempt-4.json`) also follows full
compiler0 and all89 gates passing at `dfb389f66`. The winning canonical source
contains an independent repair to the same source-selection flow. Integration
therefore reconciles the existing owners, rather than keeping competing guards:
preserve its strict parent/digest, cancellation/debounce, admission/unverified
and raw tenant/count checks, together with this continuation's attested full
selection, pending-store refusal, after-grading scope recheck and deliberate
Clear selection. Both regression sets remain; all prior receipts retain their
own actual source revisions. The integrated source must pass new checks before
publication, and the earlier401-case claim does not attest this merge yet.
