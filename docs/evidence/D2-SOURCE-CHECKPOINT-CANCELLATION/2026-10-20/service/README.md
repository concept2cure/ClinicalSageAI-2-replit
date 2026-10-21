# Genuine source-checkpoint service proof

## What already exists

- `draft-source-service-checkpoint.test.ts` and `draft-context-checkpoint.integration.test.ts` already exercise the actual source loader, private WeakMap authority, service entry/dispatch/response checkpoints, synthetic catalog boundaries and a gateway seam invoking the real callback.
- `draft-project-sources.ts` already pins actor/project identity and verifies both the extracted text identity and selected span at each checkpoint. Its baseline current-source loop does not check Stop between source, actor or program operations.
- `AnaDocumentDraftingService.ts` already sanitizes signals, passes them to the gateway, suppresses late content and cancels later batch waves while retaining completed siblings. `batch-draft-result.ts` already separates cancelled indices from repair/retry indices.
- `batch-draft-cancellation.test.ts` already proves coarse service/scheduler cancellation with mocked source checks. The new suite keeps the actual loader, private authority and service so its reds isolate operations inside current-source revalidation.

## Frozen fail-first result

The new `server/services/ana/__tests__/draft-source-cancellation-checkpoint.test.ts` has SHA-256 `fdaff67d6433e9d3dcef84a512a3aa3284b55f90ed10540aea3fb7572fee3f49`. These test bytes are frozen after one baseline run: **4 intended failures, 4 passing controls**. Production source hashes before and after the run match the pinned `0793ee48ecee5dee014b266b2def014c38ea978e` baseline.

All four reds arise only because, after the held first source read settles following Stop, baseline code starts the second source read, actor revalidation and program revalidation. The three direct service cases cover entry, dispatch and post-response. Existing late-content refusal already passes. Provider stand-in counts remain zero for entry/dispatch Stop and one for post-response Stop. The actual sequential batch case retains its completed sibling, reports current/later slots cancelled and produces no retry indices; its only red is the same unnecessary post-Stop operations.

Passing controls cover no signal, an unstopped native signal, a fresh consumer signal independent of an issued context's subsequently stopped loader signal, and a genuinely rejected source read coincident with Stop. The genuine rejection remains `DRAFT_FAILED`, exposes no internal message in results and is the only retry index; the later wave is cancelled.

## Reproduction and limits

`baseline-command.json` records the exact canonical Vitest command, Node v22.23.3, Node 22 PATH prefix, 4 GiB heap, single worker, before/after production/test SHA-256 hashes, raw-log hash and exit code. `baseline-red.txt` is the complete unedited combined output. Only this suite was run by this test owner; no compiler, Git operation or production edit was performed.

The suite uses real process-issued contexts loaded from two synthetic catalog documents. The mocked gateway invokes the actual private `beforeDispatch` closure and explicitly applies the existing cancellation helper before the provider stand-in. This is service/source proof, not native gateway, semaphore, retry, transport or real-provider proof. Already-started catalog operations are allowed to settle; the assertions prohibit the next operation. There is no SQL/socket cancellation claim.

The canonical config loads `tests/setup.ts`, whose default `pg` mock is active (`TEST_REAL_DB` was not enabled); database initialization messages in the log are emitted through that setup. Catalog/scope boundaries are synthetic; there is no live database, provider or network use by this suite.
