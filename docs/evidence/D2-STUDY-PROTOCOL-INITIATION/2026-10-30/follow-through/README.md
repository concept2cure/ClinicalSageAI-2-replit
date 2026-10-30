# D2 — AnA navigation preserves pending protocol work

## What already exists

`V2App.tsx` owns Live Drive navigation and checks ceremonies and `beforeunload`,
but not shared pending status changes. `driveQueue.ts` owns serial application,
pre-navigation refusal and exact-run reporting. `navParams.ts` owns the shared
surface-leave registry. `ProtocolWorkNavigation.ts` and `DocumentWorkbench.tsx`
already register current pending work. The continuation composes those owners;
it does not add another guard registry, router, editor, generator or canvas.

The detailed inventory and bounded implementation are in
`docs/design/STUDY_PROTOCOL_PROJECT_INITIATION.md`.

The action bus also navigates when its resolved owner is not registered.
`registeredSurfaceId()` and `resolveSurfaceIdForTarget()` identify that boundary
without mistaking a nested shared editor for another workspace. `V2App.followWork`
is the existing artifact-saved focus callback, outside the move queue. A blocked
focus is consumed in its existing dedupe set so a duplicate event cannot replay
after pending work is cleared. Explicit user handoffs and manual navigation stay
with their current owners.

## Verification

- `red.log.gz`: six expected failures before the fix; two same-owner/alias
  controls already pass.
- `green.log.gz`: eight suites, 81 tests pass. The shell mounts the actual
  protocol workspace and shared editor; a status-only change does not trigger
  beforeunload, so these cases prove the added shared guard is necessary.
- Navigation/project/handoff/remount and cross-owner actions leave the current
  editor node and project identity intact and report the same-run refusal once.
  Guard state is rechecked when a queued move executes. Clearing it does not
  replay an old move, while a fresh request may proceed.
- Blocked artifact focus does not enter the action bus or navigate; duplicate
  events remain consumed after clearing pending work, and a fresh artifact can
  focus normally. A blocked focus is not reported as a failed artifact save.
- Same registered owner and canonical action-owner aliases still reach their
  existing handlers. Exceptions in a shared guard fail closed.
- `build.log.gz`: production client/server build result.
- `lint.log.gz`: no lint errors; V2App's existing file/function-size and complexity
  warnings remain subject to the required no-new-warning push gate.
- The existing canvas-path gate passes: no new canvas, generator or editor.

Required push checks run before publication. This is engineering evidence,
not a claim of formal OQ or deployed UI validation. Manual shell controls and
browser-history navigation are not included in this bounded continuation.
