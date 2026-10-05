# The rounds that read the evidence reason, and a high-stakes turn reasons harder

Round 4 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes two findings
from round 1's map (`../../2026-10-04/map-findings.md`): MC-RL-6
(medium-high) and MC-RL-5 (medium).

## What was wrong

- **The calls that read the evidence did not reason (MC-RL-6).** A turn's
  first model call carried its thinking config. The follow-up rounds carried
  none. Those are the calls that read the tool results and write the answer.
  - On the legacy thinking surface (`thinkingMode: 'budget'`), those rounds did
    not reason at all.
  - On the adaptive flagship they reasoned, since thinking cannot be off there.
    But their reasoning was never shown or kept.

  So the reasoning panel and the sealed turn record (`setReasoning`) held the
  first call's reasoning only, written before any evidence arrived. A reviewer
  reading "AnA's reasoning" read her plan, not her reading of the sources.
- **The high-stakes floor never reached the flagship (MC-RL-5).** On a
  high-risk turn the floor was a thinking budget
  (`THINKING_BUDGETS.highStakesFloor`, 12,000 tokens), which only the legacy
  surface reads. The flagship's thinking is adaptive and self-budgets. So a
  high-stakes turn on it reasoned at the person's effort and no deeper.

## What changed

| Where | What |
|---|---|
| `server/routes/ana-ri/stream.ts` | **Every follow-up round carries the turn's thinking config, the same as the first call.** Tool turns travel as prose, so no thinking block needs replaying (the gateway's own note on the flagship entry). Every round's reasoning now reaches the panel (`thinking` frames), the stored message and the sealed record.<br>**A demonstration is the exception.** Its follow-up rounds keep their current request. A demo's talking points come back from those rounds as progress notes (`progress-updates.ts`), and a reasoning display would move them out of her words into the panel. The check is read per round, because a turn becomes a demonstration when its script arrives. |
| `server/services/ai-gateway/effort.ts` | **`resolveTurnApiEffort`** gives a high-stakes turn at least `'high'` API effort, the lever an adaptive model answers to:<br>• the floor holds under a kernel-pinned strategy, because raising effort is not the override a pin forbids;<br>• Fast is exempt, as it is from the thinking floor;<br>• otherwise the effort is the person's, and it is not sent under a pin, as before.<br>No effort maps above `'high'`, and a test pins that, so the floor only ever raises. |

A demonstration's reasoning stays where it was. Cost: a reasoning turn now
reasons on every round, not only the first, under the effort the person
chose. That is the work the person asked for, done on the calls that read the
evidence.

## Proof

- **Red first.** `red.txt`: 6 of 8 failing before the change. The 4 unit
  tests fail because the resolver does not exist. The follow-up thinking is
  `undefined`, and the high-stakes effort is `'medium'` on every call. The
  two that pass are the negative controls (Fast; a turn that is not
  high-stakes).
- **Green.** `green.txt`: 704 tests in 58 files. That is round 4's two suites
  plus every gateway suite and every stream-route suite.
- **Related suites.** `related.txt`: 6,026 tests passing. Two files fail, and
  neither is this round's:
  - the ESG transport suite, which is environmental (no
    `CONNECTOR_ENCRYPTION_KEY`);
  - `governed-reason-not-invented.test.ts`, whose scan misses a tool trunk
    added at 01:25 today (`881945fe5`). It fails the same way on an export of
    trunk `eab6563eb`, and is handed on (board item 24).
- **Mutants.** `mutants/summary.txt`: 9 of 9 killed. The first run left one
  alive (`mutants/first-run-E05.txt`). It lowered `'max'` to `'high'` in the
  floor, a branch no effort could reach. The branch was removed; the
  assumption it guarded (no effort maps above `'high'`) is now pinned by a
  test, and its mutant (E05-max-mapped) is killed.
- **Lint.** `lint.txt`: no touched file gains a warning; `stream.ts` stays at
  trunk's 24.
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside another lane's window

`stream.ts` was inside row 100's 24-hour window: its merge `3310d6c62` landed
2026-10-04 21:26. This round's hunks there are additive, at lines `git blame`
dates to 2026-09-22 through 2026-09-28. None of row 100's lines changed.

## Not done here

- The turn record does not yet say which thinking config and API effort each
  call was sent with (MC-RL-8). That is next.
- The risk tier still comes from the intent lens alone (MC-RL-3), so which
  turns count as high-stakes is unchanged.
