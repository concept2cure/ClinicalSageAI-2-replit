# Mounted-stream passage round delivery proof

## What already exists

- `server/routes/ana-ri/stream.ts` already mounts the chat stream, budgets tool
  bodies, records staged content, assembles the answer-grounding corpus and
  frames the next gateway request. Its shortfall note currently reads raw
  handler results even when budget admission changes a passage body.
- `server/services/ana/agentic-loop.ts` already supplies the canonical budgeter.
  Named passage bodies are ordinary cuttable results at this baseline, so four
  complete 7,500-unit results are each sliced during round admission.
- `server/services/ana/tool-outcome.ts` already distinguishes genuine misses
  from known matches omitted inside a handler result. It does not yet describe
  an entire response withheld by a later round budget.
- `server/services/ana/tool-output-frame.ts` already frames untrusted output and
  reversibly escapes closing tags. `turn-record.ts` already retains raw and
  differing staged bodies in the existing in-memory recorder.
- `server/routes/ana-ri/__tests__/support/stream-route-harness.ts` already offers
  a mounted route, scripted gateway, substituted handlers/context/request DB,
  captured post-processing context and the real recorder. The existing
  `read-delivery-vault.ts` helper reads unframed bodies from gateway requests.
  This suite reaches these seams; it adds no alternative host or budgeter.

## Frozen baseline

`server/routes/ana-ri/__tests__/stream-passage-round-delivery.test.ts` has six
tests: **3 intended failures and 3 passing controls**. Its frozen SHA-256 is
`c8c65be7514e3e843585ef21b5177d0e94d3eddd1295ed18a3372287f6be6582`.

The independent oracle sends four exact 7,500-UTF-16-unit complete JSON bodies.
It expects the first three byte-for-byte intact and the fourth replaced by
complete `PASSAGE_RESULT_WITHHELD` JSON of at most 200 units. It does not call
the budgeter to derive its expected prefix or replacement. Baseline failures
show sliced bodies, retained fourth-result sentinel text and raw-result
shortfall guidance. The same request is compared with the actual grounding
corpus and the existing recorder's text blobs; raw UI tool-result frames must
retain original handler output.

Two pressure cases place a synthetic 1,800-unit miss or known-match omission
after three full bodies. They require the shortfall note to describe the staged
withheld response and exclude the raw miss/omission diagnostic. Controls pin a
single fitting hit, an unchanged genuine miss, and another tool's exact ordinary
shortfall-note bytes. Unicode and closing-tag fixtures exercise the real frame
and unframe path.

The first run had the intended pressure failures plus one incorrect control
expectation: existing inferred-empty notes intentionally omit diagnostic detail.
That control was corrected to the exact existing note bytes. Large failed-string
comparisons were also rendered as booleans to keep the final transcript readable;
pressure expectations were not weakened. The original command/result/raw output
remain under `first-*`, and the final fail-first run is `baseline-*`.

`baseline-command.json` records the canonical Vitest command, Node 22 path and
version, one worker, 4 GiB heap, test hash and 19 input hashes. All 19 inputs
remained unchanged through both baseline runs. Scoped ESLint reports **0 errors
and 0 warnings**, exit 0; its exact command and raw output are retained.

## Scope boundary

The route, loop, budget, grounding assembly, framing and in-memory recorder are
real. Tool handlers/retrieval, model responses, request DB/context assembly and
durable post-processing are substituted by existing harness seams. Source IDs,
text and padded handler envelopes are synthetic engineering fixtures, including
pressure shapes that are not a claim about current retrieval frequency.
The recorder is sealed and inspected in memory; no persisted record or receipt
write is qualified. Captured gateway request content is host staging, not proof
that a provider served it. No live model/database, source-access admission,
multilingual relevance, agency acceptance, framing-overhead bound or universal
hard aggregate size guarantee is claimed. Raw `.txt` files are byte-preserved.
