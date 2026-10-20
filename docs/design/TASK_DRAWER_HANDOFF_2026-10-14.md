# Exact task drawer handoff — 2026-10-14

W1 / D2. Approved by the control tower before implementation at `6ffcb425`.
Evidence: `docs/evidence/D2-TASK-HANDOFF/2026-10-14/`.

The existing Your work drawer discards the unified task ID when it opens Tasks.
Finish Assigned tasks and unified task approvals → the exact current native task
detail. Retain TaskDetail, TaskSignOffDialog, every-store board, all native writes
and server authorization. No new store, endpoint, task model or editor.

## Interface and ownership

- Root owns `TaskTray.tsx`, `navParams.ts`, `DocumentWorkbench.tsx`, their focused
  tests, control documents and final verification/publication.
- Task UI worker owns `surfaces/TaskBoard.tsx` and new focused task-target tests.
- Audit worker owns only `docs/testing/HUMAN_BETA_CHECKLIST_V1.md` and
  `HUMAN_BETA_PROGRAM_V1.md`, plus a scoped evidence note; CI observation read-only.
- Root owns the new shared navigation helper `taskTarget.ts`. Its API:
  `taskTargetLocation(taskId, scope): string | null`,
  `readTaskTarget(search, scope): { taskId: string } | { error: string } | null`,
  `taskActorScope(user): { userId: string; organizationId: string } | null`.
  Scope IDs are strict positive numeric identifiers; the URL uses encoded
  `taskId`, `taskActor`, `taskOrg`. Task IDs are exact nonempty bounded business
  keys; malformed/duplicate params fail closed. A mismatched actor/org is refused.
- Existing `navParams.ts` owns a synchronous navigation-refusal registry:
  `registerSurfaceLeaveGuard(guard: () => string | null): () => void` and
  `surfaceLeaveRefusal(): string | null`. Workbench registers its existing busy
  guard plus dirty state; TaskBoard registers active detail/create/workflow/sign
  guards. TaskTray checks before any navigation, keeps the drawer open and shows
  the actionable refusal. No automatic save, discard, delayed navigation or
  parallel unsaved decision dialog. People finish/close the existing work and retry.

## Behavior

TaskTray and TaskBoard have actor/org keyed ownership so old reads, selection and
forms are retired immediately on an account replacement. Deferred callbacks from
old owners cannot navigate or open the new account's work. The tray builds a
scope-bound URL using the retained task ID. TaskBoard observes wouter search
without remounting on same-surface navigation, refreshes the existing board read,
then selects only the exact returned ID from the unified task store. It may clear
filters only after this match; never match a title or another store's ID. Invalid,
missing, inaccessible or unavailable-store targets show a clear result, no fallback
selection. An existing detail, form, workflow picker or signature owns the screen:
refuse replacement and preserve its state. Unrelated workflow/review queue IDs
retain their existing destinations. No numeric project FK is treated as a UUID
regulatory program. Existing project labels remain resolved by the board.

This is a UI handoff, not an authorization grant. The existing authenticated,
org-scoped board remains the source of truth. No backend read expansion is needed.

## Verification and human boundary

Show failure first for the lost exact ID and same-surface focus. Test duplicate
titles, hidden filters, stale/deleted target, partial/error/loading reads, active
native forms/signatures, actor/org replacement and late responses. Exercise the
actual drawer→board path in a browser. Run focused existing task/editor suites,
compiler, build and normal hooks. Correct the beta baseline to distinguish the
static RC descriptor from provisioned records and record actual org/program IDs.
Source/browser tests do not certify live PostgreSQL/RLS, deployed MFA, or a named
human witness. Preserve those as unexecuted human acceptance steps.

## Verification follow-ups approved before publication

Root also owns the existing `styles/app-v2.css` detail action row: allow wrapping
so the native Advance/Archive controls remain reachable at phone width. No new
visual pattern or control. The TaskBoard worker additionally owns canonical auth
fixture alignment in `taskBoardRefusalHonesty.test.tsx` and the existing workflow
create/optional-auto-assignment callback: capture the original actor's headers,
recheck owner after awaited creation before optional assignment, and state actual
partial outcomes. Never continue a write under a replacement account or claim
that an already accepted creation was rolled back. This finishes the actor
retirement invariant through the existing workflow, with no new endpoint.

The exact-baseline hosted broad test exposed a separate beta setup fixture gap:
`server/routes/c2c/__tests__/projects-create.test.ts` does not establish the active
actor/current membership now required by the existing creation admission. The
backend audit worker owns a fixture-only alignment in that file, the approved
`projects-create-fixture.ts` extraction of existing fixture data/setup, and a dedicated
red/green evidence note here. Preserve production admission and all original
validation/transaction assertions; no bypass, catch-all actor response or skip.
This closes the existing Project setup test prerequisite for this same W1/D2
human handoff. The control tower owns final contract, compiler and publication.

## Canonical creation-recovery integration

Before publication, canonical commits 2df2adde8 and a45328357 added guarded
document/section creation, scoped recovery reads and current authoring roles.
Preserve and integrate them. Independent source review identified a shared
navigation seam: Cancel may close the native creation form while its POST is
pending, leaving no dialog for the task drawer to detect. A clean Workbench's
dirty/busy guard does not own that creation ledger; unmounting could lose its
pending or unknown outcome and permit a duplicate request on return.

Root authorizes the task UI worker to connect the existing
editor/useAuthoringCreation.ts ledger to the existing registerSurfaceLeaveGuard
registry, and to own a new focused taskDrawerCreationGuard.test.tsx integration
suite. No second ledger, registry, route or creation path. Consult the same live
entries synchronously, protect unresolved creation and recovery after Cancel,
and release on the existing definite outcome or completed scoped recovery path.
Keep the native exact-created-record callbacks and scope/late-response checks.
Prove the canceled-pending and unknown/recovery cases failing first with the
actual CreateExport and TaskTray; retain existing workbench refusal and creation
tests. Root owns merge verification, any browser replay, compiler and publication.
The same bounded integration also treats HTTP 408 as an unknown creation
outcome: a timeout cannot establish that nothing was created. Retain the ledger
and recovery requirement for that response; preserve definite 403 refusal and
all other existing response policy. Prove both cases without a baseline change.

Actual-host review then found that ordinary Workbench/Authoring refresh functions
swallow read failures. Two real-host failing-first cases reproduce the resulting
release after HTTP 503. Root authorizes the backend audit worker to own
DocumentWorkbench.tsx, DocumentAuthoring.tsx and DocumentCanvas.tsx plus their
existing context/refresh tests and, if needed, a focused
authoringCreationHostRecovery.test.tsx for the pinned host. Reuse existing reads
through a recovery-only refreshCreationContext callback that returns explicit
true only after applying valid current data. Preserve ordinary refresh behavior;
failed, malformed, wrong-record, stale, held or unmounted reads cannot confirm
recovery. Section recovery verifies the current section read. Document Authoring
recovery applies the verified all-status working list. A pinned canvas refreshes
its actual current document/sections; an attempted navigation is not success.
The child has already read the canonical project working list, so the pinned
path needs no second list renderer or new route. Copy must describe that read
truthfully and ask the person to inspect working documents before another create.

The task UI worker additionally owns the CreateExport onCheckCreation boolean
type, the hook's explicit-true requirement and its existing recovery test fixture
alignment. Missing/false callbacks remain unknown. The two real-host failing-first
cases stay in that worker's taskDrawerCreationGuard suite; do not duplicate them.
No new cache/store, fabricated success, additional permission model or weakened
failure assertion. Capture the final combined browser/source boundary precisely.
Root also approves editor/documentRecordRead.ts as extraction of the one existing
Canvas readDocumentRecord implementation and its private row types. Move rather
than duplicate the reader, preserving its requests and behavior. Pure validation
may be hoisted from callbacks to avoid new lint warnings. Keep the existing
warning population at or below its prior count and rerun the host integration.

## Resumed canonical integration — 2026-10-17

Preserve the intervening canonical live-authoring approval queue, per-market
filing outline and held-program navigation cleanup. Reconcile those with the
existing exact-task and creation-recovery safeguards; do not restore an older
queue or duplicate a writer. The resumed UI reviewer owns the existing authoring
detail GET projection and its real PGlite access test: return the saved
client_program_id alongside the existing document fields, retaining tenant,
object access and scoped count predicates. Its omission prevented the pinned
canvas from verifying the real response even though the browser fixture had
modeled that field. Capture the missing-field failure before fixing the query.

That worker also owns recovery-only metadata validation in documentRecordRead.ts
and authoringCreationHostRecovery.test.tsx. Reject malformed values consumed by
the pinned renderer, retain exact document/program checks, and preserve ordinary
read behavior. Root owns optional section-structure validation, its Workbench
regression, canonical merge and final verification/publication. The separate
market-copy creator is outside this increment's CreateExport-ledger claim; record
its unresolved-outcome concern as a follow-up rather than claiming every creator
is covered by these tests.

Canonical `eceb747d3` subsequently extracts the component-owned attempt ledger for
native and specialist recovery. Integrate that one shared ledger rather than
restore the local implementation. The UI reviewer owns the hook conflict and a
minimal optional generic leave-refusal adapter on `authoringCreationRecovery.ts`:
scan the same retained entries, preserve the stable registration across scopes,
and keep admission/attempt identity/duplicate guards intact. Native creation
must still require an explicit true actual-host acknowledgment; missing/false
callbacks cannot release unknown state. Root reruns the native-host/target and
incoming specialist UI regressions, compiler/build and browser handoffs after
this merge. The incoming specialist implementation remains canonical; no new
writer or separate recovery store is authorized.

## Audited canonical integration and copied links — 2026-10-17

Canonical `e1f3fd425` adds governed outcome handling, recipient notifications,
current-actor checks and native task recovery. Root approves the UI reviewer to
reconcile all client conflicts and the necessary existing helper seams. Preserve
both the single shared attempt ledger and all-retained-entry leave refusal, the
incoming atomic ownership/read guards and identified committed-document recovery.
Both unknown and identified recovery require an explicit true actual-host refresh;
a false/missing acknowledgment cannot release uncertainty. Notification navigation
must consult the existing leave refusal before any project or editor/record target
mutation. Preserve its signing/beforeunload checks. Deferred filing-home navigation
and optional task assignment retain original actor headers and fresh ownership.

The incoming copied task-ID link is an existing user-facing capability. Preserve
it through the one canonical target/selection path: an initial URL containing
only a valid taskId and neither scope field binds to the current authenticated
actor/organization before the fresh unified-store read. It never supplies a foreign
scope. If either taskActor or taskOrg is present, strict complete scope parsing is
mandatory; partial, empty or mismatched claims cannot fall through to copied-link
handling. Retired callbacks and account round trips still refuse. Consume the URL
once and do not re-open it through a second NAV_PARAMS/raw-ID reader. Record this
explicit copied-link contract extension and its positive/negative controls; do not
quietly relax the strict scoped parser or remove the incoming capability. Existing
strict-parser assertions remain, with a separate controlled admission adapter if
needed. The reviewer owns relevant taskTarget/notification tests and canonical
account fixtures; no authority mock, signature bypass, baseline or skip is allowed.

The UI reviewer will also test native creation under same-project account/bearer
replacement without unmounting. The ledger currently keys program/document scope,
while an identified error consults the live account at catch time. If reproduced,
bind attempt ownership through existing canonical account/header helpers, retire
callbacks and leave-refusal effects for a different account/bearer, and retain
same-owner program round-trip protection through the same shared ledger. Never
interpret the later account as the attempted creator. Align synthetic authenticated
fixtures explicitly; do not introduce an unauthenticated bypass or a second store.

Native account ownership follows the existing canonical session-revision
contract: a genuine same-session token refresh retains an unresolved attempt;
login/setToken/session replacement or actor/claim mismatch retires its UI effects.
Capture the original actor headers and organization before POST/recovery, filter
retired-owner leave guards synchronously, and key retained lanes by that owner
within the same ledger. Same-owner project A-to-B-to-A still retains uncertainty.
The focused authenticated fixture alignment also covers the existing native
IND-template create test; no production dependency or alternate authorization
model is introduced.

Existing display-only component tests that mock the auth module with only
useAuth must retain the real module exports when the mounted native creation
hook reads canonical authService. Align only those incomplete fixtures and the
actual-submit authenticated fixtures, preserve their original UI assertions,
and include each touched test file in the current combined replay. An absent
identity may show the real creation refusal; no production fallback to a mocked
or unauthenticated owner is allowed.

The current broad replay exposes one stale CMC specialist handoff fixture:
canonical launch scope now refuses deferred postapproval assessment unless
explicitly false, and the enabled form requires actual classification inputs.
Root may align only specialistHandoffInteraction.test.tsx to that existing
form/endpoint and retain exact outgoing document/program/section and two-write
assertions, with explicit true/null launch-refusal controls. No production launch
policy or simulated production result may be restored.

The shipped-CSS gate on the merged build finds qms-notice rendered by the
existing controlled-document notification status with no rule. Root owns adding
that selector to the existing Quality notice-style group in quality/app.css.
Preserve status/alert roles and controls; do not add a second notification
component, style baseline exception or new theme values. Retain the first red,
rebuild and rerun shipped-class coverage and applicable design checks.


## Final editor-assembly integration — 2026-10-17

Canonical ad372567d adds document/section assembly through the existing editor.
Preserve the qualified fda2d6924 checkpoint and integrate this capability, its
preview fingerprint, reasons, exact commit receipts and retained draft lane.
The UI reviewer owns the three auth-fixture merge conflicts, the fourth
AI-draft auto-merge mock hazard, Workbench composition and a bounded leave-guard
connection in useAuthoringAssemblyBuild. That existing component owns retained
structural-commit attempts but does not register pending/unknown state with the
existing surface-leave registry. A clean host can therefore navigate away and
lose its uncertainty after form dismissal.

Connect the same retained map to the stable current-owner leave registry; do not
create a second ledger, writer or approval path. All retained scopes of the same
owner remain protected, retired account/session effects cease, and genuine
same-session refresh follows existing canonical ownership semantics. Pending
structural commit and unknown outcome refuse drawer, notification and Back
navigation. Success/definite refusal release normally; uncertain recovery must
retain the existing explicit current-view confirmation requirement. Preserve
incoming plan/commit identity, preview, reason, source, audit and signature gates.
Prove the gap first with actual host/navigation controls, then rerun affected
assembly/authoring UI and existing native-creation/unsaved-work controls.

Root owns server auto-merge review, final reconciliation/compiler/build and
normal direct canonical push. Native scope is the 19 workflow-import-governance
cases: changed insertDocumentTx/section-seed and createSection transactions are
invoked there. The other 35 native files have no behavioral overlap; five broad
runtime pins changed and must be listed rather than relabeled as unchanged.
No new migration exists in this incoming range. Root alone owns the retained
restricted runtime lease. Default checks include new assembly/plan/seed/guidance
and changed AI draft/accept fixtures; tests must retain actual canonical auth
exports instead of always-true fake session guards.

The broader 56-file editor replay additionally reproduces incomplete auth
module mocks in the mounted-host fixtures listed below. Root may preserve real
module exports in those factories only, with exact existing users and assertions
unchanged. The repetitive mount-error run is explicitly partial/interrupted, not
a completed 56-file claim; a full current replay must follow the fixture repair.
No product source, credentials, authority or baseline may change for this repair.

- `client/src/concept2cure/v2/editor/__tests__/editorBridgePropose.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/editorBridgeProposeGate.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/authoringConversationHandoff.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/workbenchCitationCatalog.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/workbenchDocumentAccess.test.tsx`
- `client/src/concept2cure/v2/editor/__tests__/workbenchRemedies.test.tsx`
- `client/src/concept2cure/v2/__tests__/auditRailIntegrity.test.tsx`
- `client/src/concept2cure/v2/__tests__/canvasDocumentsList.test.tsx`
- `client/src/concept2cure/v2/__tests__/documentAuthoringSourcesRail.test.tsx`
- `client/src/concept2cure/v2/__tests__/documentCanvas.test.tsx`
- `client/src/concept2cure/v2/__tests__/reviewOpensDocument.test.tsx`
- `client/src/concept2cure/v2/__tests__/sendForReview.test.tsx`
- `client/src/concept2cure/v2/__tests__/workbenchA11ySweep.test.tsx`
- `client/src/concept2cure/v2/__tests__/workbenchAssignReview.test.tsx`
- `client/src/concept2cure/v2/__tests__/workbenchFileToVault.test.tsx`
- `client/src/concept2cure/v2/__tests__/workbenchProjectFiles.test.tsx`

Publication ratchet completion (2026-10-18): the normal push identified two added Workbench callback warnings, one unused test import and a grown unsaved-work test file (net three warnings after an existing reduction). Scope includes extracting the existing stale-read/ceremony check without changing its ordering or refusals and splitting five exact existing target/write guard cases into `authoringLinkedTargetWriteGuard.test.tsx`. The50-case navigation and37-case unchanged guard/ownership groups pass after the cleanup. No lint/type baseline, authorization or leave guard was weakened.

Source-first canonical integration (2026-10-18): preserve catalogue selection and exact saved-document handoff from `e62320e0a` while retaining the existing structural-write hold. A new source handoff during pending/unknown structure mutation is refused before receiver/intent replacement; its original selected sources remain bound. After exact-document recovery and explicit host acknowledgement, the person may explicitly retry the new selection. No refused handoff is queued for automatic adoption. The incoming flow fixture is aligned to that stronger navigation contract, including the original unknown/clear/read/no-extra-write assertions and a deliberate post-recovery retry.

## What already exists

The existing `TaskTray.tsx`, `surfaces/TaskBoard.tsx` and native task detail supply the drawer, board and current task operations. `taskTarget.ts` carries the exact existing task identity; `navParams.ts` supplies the shared leave registry. `editor/DocumentWorkbench.tsx`, `assemblyBuildState.ts` and `useAuthoringAssemblyBuild.ts` retain native authoring state and recovery, and the existing authoring assembly service remains the writer. The saved-source controller/transport reads historical references and explicitly reuses current readable sources; it does not create prose merely by opening or checking them. This continuation connects those existing pieces and finishes their account ownership and refusal behavior.
