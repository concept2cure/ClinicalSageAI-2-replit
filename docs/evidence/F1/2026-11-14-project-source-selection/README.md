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

## Combined canonical selection implementation

The resolved merge uses the published client action/AbortController owner and
one `selectedSourcesRead` guard. It now combines exact parent/SHA-256/eligibility
checks with complete canonical selection attestation, pending-store refusal and
the explicit clear action. The original debounce fix, immediate search/page/
refresh/checkbox cancellation, upload ownership and durable editor intent remain.
The unchanged chooser and editor target are reused.

The server preserves one exact-mode SQL reader. It combines nested-query and
scope/unverified/tenant/count checks with the canonical-derived public marker,
complete route projection validation and final access recheck after grading.
Both regression sets remain; no source-read-access, permission or model policy
is changed. Malformed canonical/raw projection failures retain the published
`SOURCE_READ_ACCESS_CHANGED`503, malformed public markers use
`SOURCE_SELECTION_UNVERIFIED`503, direct missing-actor reads use503 and HTTP
denials remain concealed404. Native test formatting is compacted, with all
assertions retained, to preserve its existing code-line ceiling.

`integrated-client.json` passes303/303 across eleven suites;
`integrated-server.json` passes199/199 across four suites. All502 pass with
native exit0 and no named-input/runner drift. Both scoped lint runs have zero
errors and retain the existing6 client /3 server warnings; the pure owners and
test files add none. Independent review finds no blocker. `integrated-inputs.json`
pins the combined source. Source merge is `b07f1d791`.

`integrated-start.json` passes normal startup in37.1s; `integrated-runtime.json`
confirms the exact served merged commit, schema ready and capabilities seeded,
with only the existing local `ana: no_provider` readiness failure. The browser
runner's optional validated output prefix separates this run's observations
from earlier source versions. With `C2C_SELECTION_OUTPUT_PREFIX=integrated-`,
`integrated-browser.json` and `integrated-repaired-browser-observation.json`
pass the real search/clear/reselect/exact-admission/unchanged-chooser/New document
flow at that commit. Both recorded digests and complete admission reach the
existing editor; no page errors or document/model write attempts occur.
`integrated-lint-comparison.json` also confirms the four owners retain their
original warning counts. No live provider or broader regulatory qualification
is claimed. The combined normal compiler and canonical publication remain
pending their native receipt.

`publication-attempt-5.json` verifies that exact combined source: full compiler
errors0/baseline0 and all89 normal lint gates pass at `b07f1d791`, with no drift.
Git then refuses another canonical advancement (`d44d5313d`), so the combined
source is verified but not yet published by this attempt. The incoming changes
are disjoint worker-report references, hosted-environment policy and deviation
task currentness; they must be preserved by an ordinary merge. This continuation
does not deploy, provision paid hosting or configure providers.

## Authentication interruption and recovery

The normal merge `524a3235d` preserves those disjoint canonical changes with the
502-case source/config/fixtures unchanged. `current-start.json` passes normal
Codespaces-image startup in31.9s, and `current-browser.json` plus
`current-repaired-browser-observation.json` pass the same real source-selection/
clear/editor-start flow at that commit. `current-runtime.json` confirms the exact
served commit, schema ready and seeded capability registry; this verifier still
has only `ana: no_provider` as its readiness failure.

`publication-attempt-6.json` fails before any upload or hook: GitHub rejects the
workspace Git credential. Direct GitHub CLI user/repository API checks return401.
The connected GitHub app separately confirms repository read/push access, but
does not export a Git credential for uploading the existing commit history.
There is no stored CLI credential, credential helper or SSH identity here.
`authentication-block.json` records only statuses and repository/source identities;
no credential value is printed or added to Git. A secure workspace Git-auth refresh
was requested; no token should be pasted into chat.

While waiting, `run-normal-prepush.py` runs the unchanged canonical hook as a
validation-only check with the real local/upstream ref input and no skip flags.
It moves no remote ref, and a later authenticated push must still run its normal
hook. `auth-blocked-normal-prepush.json` now passes that unchanged hook at
`524a3235d`: native exit0, all89 lint-job gates0red, full compiler0/baseline0,
with no source/runner drift. This is validation, not an authenticated push.
**The local continuation is not
published by any of the six recorded attempts.** Earlier passing checks do not
turn any failed push into a successful publication.

All implementation and merge work is committed on the local canonical branch;
the final receipt-only commit changes no product source. No PR, alternate branch,
force update, rebasing, provider setup or deployment was performed. Publication
must resume with refreshed workspace Git authentication; inspect the current
canonical head, preserve any new work by normal merge, then use the normal push.
Do not paste a token into chat or place one in this packet. Source/test workers
are closed and frozen; no other lane is claimed paused. The source holds end
under their recorded publication/03:00UTC lease, and require a fresh ownership
check before any later source edit. Runtime remains the normal local declared-
image verifier at the named tested commit, with no live-model qualification claim.

At02:44UTC a fresh private CLI probe succeeds, and the repository API confirms
push permission. Workspace Git authentication has recovered; no credential value
was printed, copied into the repository or requested in chat. The credential
question no longer blocks the already authorized normal push. A fresh fetch also
finds published CMC integrity/overview work at `a5de561bc`, which must be preserved
by the next ordinary merge. The implementation inputs remain frozen and the
normal push will run its hook again. The authentication-block record retains
both its actual earlier401 and successful recovery, without rewriting history.


## Authenticated canonical integration retry

`publication-attempt-7.json` records authenticated normal Git at `1b061c030`:
all89 lint gates pass and full compiler errors0/baseline0, with no named input
or runner drift. Git then rejects a ref race from `a5de561bc` to `4b82ba809`.
Authentication is working; this failure is not a credential failure. The incoming
filing-class/catalogue/bootstrap/migration corrections are outside the four
selection owners and are preserved by ordinary merge. The502-case selection
inputs remain frozen. Source/test edit holds end at the recorded03:00UTC lease;
root continues only normal integration, Git and owned evidence/runtime closure.
No lane is claimed paused, no source edit is added, and publication remains
unconfirmed until an actual successful push receipt.


`final-source-start.json` applies the standard Codespaces startup successfully
in37.99s at merged `6c466782c`. `final-source-runtime.json` confirms that exact
served revision, schema ready and capabilities seeded. The only readiness
failure remains local `ana: no_provider`. `final-source-browser.json` and
`final-source-repaired-browser-observation.json` pass the actual two-source
search/clear/reselect/exact-admission/unchanged-chooser/single-editor-start flow
at that revision with no input/runner drift, page error or attempted document
write. The chooser screenshot catches its existing drawer entrance animation;
the completed editor-start screenshot records the stable existing form.
No production styling or second editor was introduced.

The next deferred-context RED should use an unstarted chat thread: a bound
thread already has `THREAD_PROJECT_MISMATCH` protection. Existing test homes
are `projectHomeOwnershipBoundary.test.tsx` for completed handoff A, unmount,
`openProjectHome(B)` and remount, then `useAnaChat-attachments.test.ts` for the
later request's source IDs/project pairing. Preserve same-project/bearer-refresh
and one-turn consumption positives, plus actor/session and A-to-B-to-A controls.
The current static trace still identifies `shellProject.ts`'s revision guard,
`captureAuthoringSession` and existing pin consumption/reset as the owners; no
new source implementation or runtime disclosure proof is claimed here.


`publication-attempt-8.json` passes full compiler0/baseline0 and all89 normal
lint gates at `6c466782c`, with no named-input or runner drift. Its upload then
loses a reference race to `f5a7464ed`. Independent review finds its editor
loading/error/filter and unbound-working-copy save-message repairs leave
source selection, target/creation callbacks and filing safeguards intact. They
are preserved by ordinary merge. The next run records targeted editor integration
before normal publication; no source implementation is reopened.


The normal merge `99bcd9020` preserves the published editor loading/read-retry/
filter and unbound-save-message repairs with the frozen502-case selection
inputs unchanged. `editor-merge-focused.json` passes all74 cases across six
affected editor handoff, document-start, save-label and filing-note/commit
suites, native exit0 and no named source/runner drift. Those74 include earlier
handoff coverage; they are not claimed as74 additional distinct regression
cases. `editor-merge-publication-inputs.json` also pins the incoming production
owners and focused fixtures. The next authenticated normal push runs all its
existing gates against this merged tree.


`publication-attempt-9-interrupted.json` distinguishes an execution-environment
replacement from a completed native push: the full compiler was still active
when its process was lost. There is no native exit, completed output or upload
receipt for that attempt; no pass is inferred. Recovery at03:18UTC confirms all
32 named implementation/config/test inputs still match their frozen manifest.
The local checkout, prior actual receipts and owned Docker verifier survived.
Remote `bc8fd9190` contains only documentation/coordination changes since the
last merged source and is preserved by ordinary merge. Normal authenticated
publication must run the existing hook again.


`recovered-source-start.json` successfully runs standard startup in36.96s at
`21ec04579`; `recovered-source-runtime.json` records that exact served commit,
schema ready, capability registry seeded and only local `ana: no_provider`.
`publication-attempt-10.json` verifies the recovered merged program with full
compiler0/baseline0 and all89 normal lint gates0red, no input/runner drift. Git
then rejects the reference advance to `f9656d88e`. Independent review confirms
the incoming TaskAssignmentControls/taskAssignmentRequest changes keep their
existing interfaces and are disjoint from ProjectHome, source admission and
editor callbacks. The normal merge preserves those changes and their evidence.
No successful publication is inferred from this passing hook.


Merge `0df1d40ae` preserves both coordination entries and the canonical task
assignment repair without changing the32 frozen selection/editor inputs.
`assignment-merge-focused.json` passes57/57 cases across its two affected
control/request suites, no source or runner drift. The36-file manifest adds
those four task implementation/test files. This is targeted integration evidence,
not a replacement for the earlier502-case selection or74-case editor checks.
The next normal authenticated push records its own complete compiler/gates and
actual remote outcome.


`publication-attempt-11.json` verifies `0df1d40ae`: full compiler0/baseline0,
all89 normal lint gates0red and no named input/runner drift. Its normal upload
loses a reference race to `641494ffe`. Incoming changes are a Vault taxonomy
proof fixture, exact historical secret-scan fingerprint classifications and
coordination/evidence; the selected-source product inputs remain unchanged.
Preserve those canonical changes by ordinary merge and run the affected proof
before the next authenticated normal push.
