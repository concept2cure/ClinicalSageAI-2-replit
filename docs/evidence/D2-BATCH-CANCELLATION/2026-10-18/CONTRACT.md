# D2 / W2 — batch drafting cancellation propagation

Date: 2026-10-18. Baseline: `c35a3204099929fb3a2a33d661cf28eb52e3cb12`.
Need: priority 2 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

This carries the existing trusted Stop signal through work AnA batch drafting
already does. No new surface, provider, model, schema, route or output
authority is added.

## Observed defect at baseline

`runOneTool` places `ctx.signal` in the tool context and races the handler
against it, so the round stops. `batch_draft_sections` never reads the signal:
its per-section source loads, `batchDraft`'s later waves and every
`draftDocument` → `gateway.route` call keep running after Stop, reading
selected sources and dispatching model calls whose results nobody will read.
The gateway already honours `GatewayRequest.signal` (pre-call refusal, limiter
release, SDK abort, `GatewayAbortedError` that is never retried or fallen back).

## Contract

1. **Trusted input only.** `DocumentDraftRequest.signal` and
   `BatchDocumentRequest.signal` are honoured only when they are a real
   `AbortSignal`. The AnA tool supplies `ctx.signal`. JSON cannot produce one,
   so a body-supplied `signal` on `POST /api/claude/batch` is ignored.
2. **`draftDocument`** checks the signal before the source checkpoint, before
   dispatch, passes it to the gateway, and checks again after the gateway and
   final source recheck return. A success that settles after Stop is
   suppressed, including a mid-stream partial with `finishReason: 'aborted'`.
   Cancellation throws `DraftCancelledError`.
3. **`batchDraft`** checks before each wave. Once stopped, no later wave is
   dispatched. Unstarted sections and in-wave sections whose rejection is a
   cancellation (`DraftCancelledError`, `GatewayAbortedError`, `AbortError`)
   become `DRAFT_CANCELLED` slots. Sections completed before Stop keep their
   drafts. A genuine failure keeps its own classification. Order and
   one-slot-per-request are unchanged.
4. **`batch_draft_sections`** checks before the recorded-context lookup, before
   and after each source read (a read that settles after Stop is discarded),
   and passes the signal to `batchDraft`. Sections not reached are
   `DRAFT_CANCELLED`.
5. **Receipt retry policy.** A cancelled slot has `status: 'cancelled'`,
   `saved: false`, no content, and is listed in `cancelledIndices`, **not**
   `retryIndices`. A person's Stop is not a failure to repair, and is not
   retried unless the person asks again. Receipt `status` is `cancelled` when
   any slot was cancelled. `failed` counts genuine failures only.

## Proof required

Fail-first against baseline bytes, then green with the same test bytes:
service — hold wave one, abort, release, prove no further `draftDocument`
call, completed siblings kept, the rest cancelled. Gateway seam — a pre-aborted
signal never reaches `gateway.route`, the signal is forwarded, and a late
success after Stop is suppressed. Tool — abort during the first source read,
prove no second read and no `batchDraft` call. A non-`AbortSignal` value is
ignored. Existing batch, source-checkpoint, termination and route suites still
pass. Scoped ESLint and the normal pre-push gate (whole-project TypeScript).

## Limits

Stop cannot un-spend a provider call already in flight. The SDK abort only
stops waiting for it. Source reads are database calls without a signal, so a
read in progress completes and its result is discarded. Tying the HTTP batch
route to client disconnect is not in scope.
