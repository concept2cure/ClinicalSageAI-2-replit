# Independent review: complete existing action ordering

Reviewer: `action_order_contract`. Date: 2026-10-30. Baseline: `438287ed102ff9857938276bbe835f0ec1c11a88`. Review is source-only: no runner, compiler, browser or Git mutation was executed. Only this review document was written.

## What already exists

- `client/src/concept2cure/v2/surfaceActions.ts`: the canonical action bus. It already owns validated/resolved surface targeting, one TTL-bound pending slot, queued replacement notifications, exact caller cancellation, current-handler invocation, retries, and the optional React commit/disposal promise. `applySurfaceAction` currently returns a successful immediate result without retiring an older pending directive for that same action.
- `cancelPendingSurfaceAction` (`surfaceActions.ts:269`): existing cancellation primitive; it consumes the current entry only when its directive is the supplied object, clears its timer, then reports an unavailable outcome. It checks directive identity, not pending-entry identity. Reuse it; do not introduce a second cancellation mechanism.
- `resolvedTargetSurface` and `shared/navigation/surface-actions.ts`: canonical aliases; task directives use `tasking`, while the actual board registers `tasks`. Compare resolved surfaces rather than raw surface ids.
- `Shell.tsx` calls the bus when a rail entry supplies an action. The Tasks rail requests the existing team-wide filter. `TaskBoard.tsx` refuses filter application with retry while either task data or project choices load, then signals readiness after both settle. Visible task rows alone do not establish this action's readiness.
- `surfaceActions.test.ts`: queued replacement, retry, expiry, alias and registration-owner behavior. `surfaceActions-commit.test.tsx`: real React commit/disposal ordering. `driveQueue-cancel-pending.test.ts` and `driveQueue-react-selection.test.tsx`: stopped-caller cancellation and sequential selection boundaries. These are the existing regression owners to extend/retain.
- The design/evidence inventory records the current six-step project journey and deleted-history search. This ordering fix neither replaces that journey nor creates an API, table, service, action id, model, grant or governed mutation.

## Decision

**APPROVED**, with the exact-entry requirement below made explicit before implementation. The proposed extension is narrow and addresses a real source-permitted ordering defect. Root must still demonstrate its deterministic failure on unchanged production before claiming a reproduced defect or successful fix. The earlier whole-board failure alone did not establish its root cause, because that test ignored the action outcome/readiness.

1. Snapshot the pending **entry** before invoking the current handler.
2. After the handler returns an **applied** immediate outcome, retire an older snapshot only when it is still the exact current pending entry (`pending === snapshot`), its directive is distinct from the newer directive, its action id matches, and its target resolves to the same registered surface.
3. Retire it through the existing cancellation primitive. Report replacement once and clear its retry timer. Keep the newer immediate outcome, detail and optional `committed` promise unchanged.
4. Leave the existing behavior intact for retry/stash, failed or thrown/refused handlers, unavailable operations, different action ids, different resolved surfaces and identical directive objects. No permission or validation check is bypassed.
5. Preserve work created while the newer handler runs. **Directive equality alone is insufficient:** a reentrant handler may replace the pending entry while reusing the old directive object. An explicit pending-entry identity check prevents cancelling that newer entry.
6. Cancellation removes the old entry before calling its existing deferred observer; if that observer schedules further work, that further work must remain owned by its caller. No unrelated queue policy or Drive cancellation behavior is changed here.

The same-action boundary is intentional. A pending view selection and a later filter selection can both be meaningful; this review does not approve cancelling every pending operation whenever any newer operation succeeds.

## Deterministic red and guard cases

Use real registry-resolved directives and the real bus with controlled non-React handlers; no timing sleeps or board readiness assumptions are needed.

1. **Required red:** register `tasks` with `tasking.filter` initially retrying. Apply old `mine=false`; assert stashed. Make its handler ready without sending a ready signal. Apply distinct new `mine=true`; assert immediate applied and true is recorded. Send the ready signal. Assert the old false never runs afterward, final selection remains true, and old deferred outcome is a replacement exactly once. The present branch returns immediately and then replays false, so this should fail before the fix.
2. **Timer/callback ownership:** use fake timers, perform the same sequence, then send repeated ready signals and advance beyond TTL. Old replacement is reported once, old selection never applies, and no expired callback remains.
3. **Resolved alias:** keep the registry's `tasking` target and the board's `tasks` registration; the correction must work across the existing alias.
4. **Refused/throwing newer action:** old same-action work remains pending when the newer handler fails or throws. Later allowed readiness can still settle it through the existing path. Failure reasons and immediate status remain honest.
5. **Same surface, different action:** hold `tasking.set-view`, successfully apply `tasking.filter`, then release the view readiness. Both independent state updates remain reachable; the view callback is not cancelled by the filter.
6. **Different surface:** hold a Vault directive while a Tasks filter succeeds. Returning/registering Vault still settles its own old directive; the unrelated success does not cancel it.
7. **Reentrant newer pending entry:** while the new filter handler runs, deliberately queue another directive. Assert this newer slot survives the outer success. Include a variant that reuses the original old directive object, which specifically fails an implementation that checks only directive identity.
8. **Existing queued supersession:** when the newer same-action request also retries, the existing stash replacement still reports the old outcome once and eventually applies only the newer request.
9. **Commit boundary:** request `waitForCommit` with a controlled existing commit promise. Supersession must return that same promise and detail unchanged. Run the existing React/Drive commit suites as integration regressions.

For the real-board sequential integration test, await the actual project option as well as task rows, let passive readiness effects commit, and assert the newer action's immediate applied status/detail. Preserve colleague-row exclusion, own-row inclusion and active Tasks navigation assertions. This sequential proof complements the deterministic overlap test; it must not substitute for it.

## Limits of this approval

This approves the ordering contract, not an implementation or publication. Root retains red/green execution, current caller regressions, build, lint, TypeScript, all normal push gates, current-branch synchronization and direct publication ownership. No claim of whole-platform perfection, authenticated browser acceptance, agency transmission or signature execution follows from this source review.

## Reviewed source pins

```json
{
  "client/src/concept2cure/v2/surfaceActions.ts": "013cd9f750c8f9ed3dd3f6be9326c9fea915d37e8ff041cd3d2bbd5dbaaae09b",
  "client/src/concept2cure/v2/surfaces/TaskBoard.tsx": "a6e013f38467747c313d4095ad31d25bc8f31dbeecaf58153d4c2fc37f0398ac",
  "client/src/concept2cure/v2/Shell.tsx": "1c5777170c14e5f0e1d5d8c5f1a2991019b2aca7ec37fa58fe8107b5f178ff66",
  "client/src/concept2cure/v2/driveQueue.ts": "721f16a54cfa4f143054732dab6738f5f9cbc45f488c20f2d5c587af6d09f009",
  "client/src/concept2cure/v2/__tests__/surfaceActions.test.ts": "ea46c72effce981c1de44fb655c0cf142d447c6458eb9944949adbb6393f56ad",
  "client/src/concept2cure/v2/__tests__/surfaceActions-commit.test.tsx": "3202e1320e8a9e78d3d5546e5a7eff94c916bef4f5cde3462247f261e91475b1",
  "client/src/concept2cure/v2/__tests__/driveQueue-cancel-pending.test.ts": "2faf3516aa422bc01a1543b36e9738e117e3ffa6ecc4187025a3e62189f8849b",
  "client/src/concept2cure/v2/__tests__/driveQueue-react-selection.test.tsx": "4f4cfa06ec9416b7b8b9a9e144f51be72721e476b2635dfd14d17f4d9949aabd",
  "shared/navigation/surface-actions.ts": "888e74fd750698bc8ebfbb13ad59652b00ceb02fc9595dfebed77738a0a0465e"
}
```
