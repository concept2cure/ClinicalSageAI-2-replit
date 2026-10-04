# D6 — a served embedding is on the AI ledger (2026-09-29)

**Row:** D6. **Workstream:** W2 gateway scope. **Closes:** the "Not done" item of `../2026-09-26-model-ledger/` (review
round): *served embeddings still write no ledger row*.

Embeddings are the one governed egress that does not pass through `AIGateway.route()`. `embedding-provider.ts` calls the
provider SDK itself, after `AIGateway.authorizeEmbedding` has decided placement (P0-11). That decision recorded a refusal
only. The call itself, vault text sent to OpenAI or to the on-prem embedder, left no row. So "where did my data go" could not
be answered for embeddings. An allowed placement decision went to a log line only, the exact defect the model-ledger change
fixed for chat.

## What is true now

- `authorizeEmbedding` resolves with its authorization: the request id, the start time, the governed request (the tenant's
  floor merged in, the content classified), and the placement decision the last-mile gate took. It used to resolve with
  `undefined`.
- **`AIGateway.recordEmbeddingCall` writes the call's row** through the same `logAudit` a chat call uses, once the provider
  answers. The row carries:
  - the tenant binding, provenance and data class;
  - the placement reason code;
  - the lane's region (`on_prem` for the self-hosted embedder);
  - the model and the input tokens;
  - the prompt hash, and never the text.
- **The embedding provider records a served row after `embeddings.create` resolves.** When it throws, the provider records a
  failure row with the error, and still rethrows it to the caller.

## Red and green

| What | Red (`af3c89c1`) | Green |
|---|---|---|
| `embedding-provider.test.ts`: PHI embedded on the approved on-prem lane leaves one served, content-free row (`on_prem`, `phi`, `ALLOW_…`) | the case pinned zero rows; with the assertion corrected it fails | pass |
| Same file: a served OpenAI embedding leaves one row; a failed one leaves a failure row and the error reaches the caller | 2 fail | pass |
| `embedding-placement-gate.test.ts`: an allowed authorization resolves with its authorization, and deciding still writes no row | (was `undefined`) | pass |

`red/tests.txt` has 3 of 11 failing. `green/tests.txt` and `green/suites.txt` cover `server/services/ai-gateway` and every
suite that reaches the embedding seam: 1161 of 1161 pass. `green/typecheck.txt` reports 0 errors.
