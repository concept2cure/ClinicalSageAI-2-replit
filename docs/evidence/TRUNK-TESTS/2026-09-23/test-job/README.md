# concept2cure-v2 CI: the Test job's two red cases, 2026-09-23

The Lint gates red on the same runs are in `../README.md` and `7983d729`. This
folder covers the Test job, which failed 2 of 30,523 tests in run 35885373726
at `3d58f9e1` (`red/ci-test-job-3d58f9e1.txt`). Neither case came from a change
to what it tests: one test read a file by the order of its code, the other by
the millisecond its rows were written. Both fixes are to test code only.

The W3 session found them while checking CI after its own pushes.

## What was red, and why

| Case | Cause | Whose | Fix |
|---|---|---|---|
| `surface-honesty.contract.test.ts` › ProtocolDev › "its governed acts reach the server" | The case cut the register-form mount out of `ProtocolDevWorkspace.tsx` as the text between `<ProtocolRegisterForm` and `<C2CToast`. `a3e66c99` (D5, the ESLint paydown) moved the mount into `GovernedDrawers`, below the toast. The cut ran backwards and read `''`. The behaviour it pins survived the move: `onDone` still produces the copy through `registerDoneMessage` and then calls `onChanged`. The case reads source text, so it fails on every tree from `a3e66c99` on: on CI at `3d58f9e1`, and locally at `35d379a2`. | D5 lane; the test's anchor | The case reads the element itself (`jsxElement`: from `<ProtocolRegisterForm` to its own `/>`, with braces balanced). |
| `chain-order.pglite.test.ts` › "diagnoses the pre-fix fork" | The fixture stamped each row `new Date().toISOString()`, to the millisecond. The legacy walk orders rows by `(occurred_at, id)`, and so does the seal check's `brokenAt` index. Two rows written in the same millisecond were ordered by their random ids, so half the time a pair written first-then-forked was walked forked-then-first. The break was then reported at the other row: the CI result exactly. Intermittent. | WA lane (`26c65e2e`); the fixture | Rows a case does not stamp itself get strictly increasing instants (`nextInstant`). |

## How each was shown

**ProtocolDev.**
- `red/protocoldev-contract-at-35d379a2.txt`: the case failing at trunk head, 1 of 4 in its block.
- `green/protocoldev-contract-mutants.txt`: with the fix, four runs against `ProtocolDevWorkspace.tsx`:
  - HEAD's file: passes.
  - M1, `onChanged` removed from the register `onDone`: fails.
  - M2, `onDone` announcing its own copy instead of `registerDoneMessage`: fails.
  - M3, the file as it was before `a3e66c99`, mount above the toast: passes.

  The case now fails when the behaviour goes, and no longer fails when the code moves.

**Chain order.** The tie was made certain rather than waited for. A throwaway
copy of the suite, never committed, injected this after its imports:

```ts
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  let n = 0;
  const randomUUID = () => 'ffffffff-ffff-4fff-bfff-' + (0xffffffffffff - n++).toString(16).padStart(12, '0');
  return { ...actual, default: { ...actual, randomUUID }, randomUUID };
});
vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-23T12:00:00.000Z') });
```

The wall clock stands still, and every new id sorts before the last. So every
row ties, and `(occurred_at, id)` is the reverse of the write order.

- `red/chain-order-tie-probe.txt`: 4 of 11 fail on the old fixture, not only the one CI caught:
  - "records a chained row written without a position as legacy";
  - "anchors a tenant's first sequenced row to its legacy head";
  - "diagnoses the pre-fix fork";
  - "seals through the same walk", whose `brokenAt` index read 0 for 1.
- `green/chain-order-tie-probe-and-suite.txt`: with `nextInstant`, the probe passes 11 of 11 under the same conditions, and so does the suite itself.

## Found, not fixed: the same tie in production

The production writer stamps `occurred_at` the same way
(`server/services/auditService.ts:269`, `new Date().toISOString()`), so two
audit rows written in one millisecond tie in a real database too. Sequenced
rows verify by `chain_seq` and are unaffected. The tie matters in two places:

- **Legacy rows** (written before `chain_seq`): the verifier can only order
  them by `(occurred_at, id)`. A tied pair whose ids sort against the write
  order reads as a break. That is a false alarm, not a missed one: the verdict
  errs towards "broken", and the chain is never passed when it is not intact.
- **The seal check's `brokenAt`** is an index into the same `(occurred_at, id)`
  order (`verifyAuditChainSeals`, `compareWriteOrder`), for sequenced rows too.
  Under a tie it can name a different position than the chain order would.
  `valid` is unaffected.

The owner is the audit chain's lane (WA, `26c65e2e`). Two possible fixes:
- order a group of tied legacy rows by their hash links before calling a break;
- report the seal break by row id rather than by index.

No test pins either behaviour, so the fixture change hides nothing a test
claimed to check.

## The Lint gates, for completeness

One of the two Lint gates red at the same head was set off by this lane's
commits. `ci:tenant-entry-points` read "both SCIM consoles" in the F-31
comment (`916027a98`) and the X-API-Key pointer in the F-32 comment
(`2dd78265d`) as API-key entry points. It was the gate that was wrong: it
matched comments. `7983d729` (D6) made it read code only, with a self-test
that fails 2 of 5 on the old rule. That gate is not in `.husky/pre-push`, so
the push did not run it. Before this push the whole Lint job was run locally:
`green/lint-job-local.txt`.
