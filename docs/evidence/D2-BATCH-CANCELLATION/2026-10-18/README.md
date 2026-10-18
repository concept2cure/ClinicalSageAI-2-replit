# D2 / W2 — Stop reaches nested batch drafting work

Baseline: `c35a3204099929fb3a2a33d661cf28eb52e3cb12`.
Contract: [CONTRACT.md](CONTRACT.md). Need: priority 2 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

At baseline, `runOneTool` raced `batch_draft_sections` against Stop, so the
round ended, but the handler never read `ctx.signal`. Source reads, later
`batchDraft` waves and gateway dispatches all carried on in the background.
Now the existing trusted signal is honoured at each of those boundaries:

| Boundary | Change |
| --- | --- |
| `batch_draft_sections` (`prepareBatchSections`) | No recorded-context lookup or source read starts after Stop. A source load that settles after Stop is discarded. The signal goes to `batchDraft`. |
| `batchDraft` | Checked before every wave. No later wave is dispatched. Sections finished before Stop keep their drafts. Unstarted sections and in-wave cancellations become `DRAFT_CANCELLED`. Genuine failures keep their own code. |
| `draftDocument` | Checked before the source checkpoint and before dispatch. The signal is forwarded to `gateway.route`. Checked again after the gateway and final source recheck, so a late success (including a mid-stream `finishReason: 'aborted'` partial) is never offered as a draft. |
| Receipt | Cancelled slots have `status: 'cancelled'`, no content, and appear in `cancelledIndices`, not `retryIndices`. Receipt `status` is `cancelled`. Stop is not a failure to repair and is not retried unless the person asks again. |
| Trust | Only a real `AbortSignal` is honoured (`trustedSignal`). A body-supplied `signal` on `POST /api/claude/batch` is ignored. |

## Fail-first and final checks

- `initial-red.txt`: frozen tests against baseline production bytes. **12
  intended failures, 2 passing controls** (forged signal ignored, no-signal
  batch unchanged). The wave test times out at baseline because wave two is
  dispatched after Stop and waits on releases that never come. The tool test
  shows the second section's source being read after Stop.
- `initial-red-pre-fixture-remedy.txt`: an earlier red run, kept as it
  happened. Its tool-test read assertion counted catalog reads (the loader does
  3 per document, not the 2 assumed). Before implementation, it was replaced by
  an identity assertion: the second section's document ID is never read.
  The red run used the original test bytes: SHA256 `0163c437…45f8`
  (service) and `6ec11f28…8588` (tool). The review round below then changed
  both files.
- `final-green.txt`: the final test bytes (`frozen-tests.sha256`) plus the
  existing batch concurrency, per-section settlement, termination
  receipt/tool, recorded submission context (PGlite), source checkpoint,
  blueprint, submission-context and four `ana-intelligence` route suites:
  **244 tests / 15 suites pass** (17 of them new). Command:
  `test-command.json` (repo config, one worker, 4 GiB heap). No provider, live
  database or agency call.
- `lint.json` / `lint-baseline.txt`: zero errors. Warning counts equal baseline
  per file (6 / 95 / 1 / 0); new tests have none. Two warnings introduced
  during implementation (complexity, max-params) were removed by extracting
  `prepareBatchSections` and `batchDraftInstruction`, not by suppression.
- `typecheck.txt`: `ci:typecheck:no-regression`, **0 errors against a baseline
  of 0**, run at a 13 GiB heap because the container has 15 GiB. That run began
  before the review fixes below. The normal pre-push gate re-checks the final bytes.

## Independent review

A read-only reviewer found no blocker and five notes. Four led to changes in
`2610ebf1`, after implementation `f144f22d`:

1. A source recheck could start for a draft that settled after Stop. Stop is
   now checked before the recheck.
2. Any abort-shaped rejection became `DRAFT_CANCELLED`, even with no Stop. It
   is now cancelled only when the signal actually fired.
3. A genuine source refusal during Stop was relabelled cancelled. It now keeps
   its `DRAFT_FAILED` classification (contract item 3).
4. The wave test's mock let wave one settle after Stop, which the real
   `draftDocument` would refuse. The test now models that refusal: wave one
   finishes before Stop, wave two is in flight and refused late, and wave three
   is never dispatched. The handler's post-Stop catch path gained a test.

`review-red.txt`: against `f144f22d` production bytes, 4 of the new assertions
fail (the recheck count, the abort-shaped failure without Stop, and the source
refusal during Stop). The rewritten wave test and the catch-path test pass
there too; they add coverage, not fail-first proof. Not changed: a receipt
with any cancelled slot reports `status: 'cancelled'` even if other slots
failed. The contract specifies this, and `failed` / `retryIndices` still
report the failures.

## Limits

Stop cannot un-spend a provider call already in flight. The SDK abort only
stops the wait, and the gateway does not retry or fall back. Catalog reads take
no signal, so a read in progress finishes and its result is discarded. The HTTP
batch route is not tied to client disconnect. The quick-completion,
vision, compliance-review and gap-analysis paths are unchanged. Gateway and
catalog seams are synthetic in these tests. This is not deployment, PQ,
scientific validation or agency acceptance.
