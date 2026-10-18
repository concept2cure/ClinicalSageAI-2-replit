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
- `final-green.txt`: same test bytes (`frozen-tests.sha256`, verified with
  `sha256sum -c`) plus the existing batch concurrency, per-section settlement,
  termination receipt/tool, recorded submission context (PGlite), source
  checkpoint, blueprint, submission-context and four `ana-intelligence` route
  suites: **241 tests / 15 suites pass**. Command: `test-command.json` (repo
  config, one worker, 4 GiB heap). No provider, live database or agency call.
- `lint.json` / `lint-baseline.txt`: zero errors. Warning counts equal baseline
  per file (6 / 95 / 1 / 0); new tests have none. Two warnings introduced
  during implementation (complexity, max-params) were removed by extracting
  `prepareBatchSections` and `batchDraftInstruction`, not by suppression.
- `typecheck.txt`: whole-project typecheck gate result.

## Limits

Stop cannot un-spend a provider call already in flight. The SDK abort only
stops the wait, and the gateway does not retry or fall back. Catalog reads take
no signal, so a read in progress finishes and its result is discarded. The HTTP
batch route is not tied to client disconnect. The quick-completion,
vision, compliance-review and gap-analysis paths are unchanged. Gateway and
catalog seams are synthetic in these tests. This is not deployment, PQ,
scientific validation or agency acceptance.
