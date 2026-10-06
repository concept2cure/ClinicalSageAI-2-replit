# W3 / D4 — AnA usability follow-up

The founder approved direct publication to `concept2cure-v2` and requested a
further improvement pass. The first tested fixes were published as
`d5e9b20aa053e364a4b44351d8180feeb04d7dd2`; the GitHub-created tree was verified
byte-for-byte by Git tree SHA against the locally tested commit.

## Reproduced failures addressed

1. **A stopped demo could still operate a loading screen.** Clearing the drive
   queue did not clear its already-stashed surface action. The old operation
   could execute after Stop, and a replacement demo could wait for the old
   action's 20-second expiry / 22-second queue fallback. Clearing now cancels
   only that still-pending directive and reports it dropped once. Completed
   actions keep their actual outcome; a different user-selected action is not
   removed. See `client/README.md` for red/green evidence.
2. **Provider SDK retries multiplied gateway attempts.** Streaming requests
   configured for zero gateway retries still made three underlying HTTP
   attempts per provider. Gateway-owned SDK clients now disable SDK retries;
   the existing gateway retry/fallback policy owns all attempts, including
   non-streaming transient and overload retries. See `gateway/README.md`.

These changes preserve provider/model selection, regulatory risk escalation,
tenant scope, approval gates, navigation budgets, and governed artifacts.

## Verification and remaining limits

The subdirectories contain executable regression tests' red/green outputs and
adjacent-suite results: 58 client tests in five suites and 84 gateway/provider
tests in eight suites pass. Repository pre-push guard results are recorded
alongside this file. No dependency or baseline expansion is required.

The founder explicitly approved publication despite the earlier full local
TypeScript check exhausting this environment's 8 GiB memory limit. The original
compiler failure is retained under `../2026-10-06-ana-usability/`; it is not a
typecheck pass. The repository's CI typecheck remains enabled and unchanged.

The first publication's GitHub typecheck completed and reported exactly two
TS2322 errors in the new `useAnaChat-network-waits.test.ts`: the tests explicitly
typed a captured Stop result as `Promise<void>` even though the public hook
contract exposes `void`. The tests now derive the captured type from that
contract, preserving their runtime awaits and behavioral assertions. No
production signature or typecheck baseline was changed. The follow-up CI run
must verify this correction. The initial pushed-file lint ratchet also caught
one function-length warning; the existing `whenIdle` expression was formatted
compactly and the gate rerun without adding a suppression.

No live tenant URL or production credentials were supplied. These results prove
the exercised code paths, not an end-to-end live demo or a production latency
improvement. D4 is not declared complete on this evidence alone.

## Live retest

On the same deployment and tenant used for the failed test:

1. Start a demo; record time to first visible progress and first spoken/text
   answer, and retain the existing stream phase telemetry.
2. Stop while Vault or another screen is still loading. Confirm the old action
   does not run when that screen becomes ready.
3. Immediately start a different demo. Confirm it starts without the old
   action's timeout and reports real screen outcomes.
4. Complete a tour against available tenant records. Confirm missing records
   and unavailable services are explained accurately.
5. Compare first-token and total timings for a greeting, one navigation request,
   a demo, and a substantive regulatory question. Large persona/tool context
   and coarse regulatory routing remain measured candidates for a later change;
   this pass does not reduce context or downgrade models speculatively.
