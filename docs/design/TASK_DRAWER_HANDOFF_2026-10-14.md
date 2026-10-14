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
