# P1-54 (part) — an embedding refusal is reported as unavailable search, and not retried

Launch row **D6**. Plan item P1-54 (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`),
residuals R2 and R3 of the P1-45 review. Remaining in P1-54: the self-hosted `bge-m3` service in Terraform
(ADR-0014 §1.5) and R4 (readiness for unelected tenants).

## R2 — "found nothing" and "could not search" are different answers

`server/routes/chat/send-message.ts` caught any retrieval failure — including the gateway refusing the
embedding because the tenant has not elected the embedding lane (P0-11) — and then built the prompt as if the
search had run and returned nothing. The model was told to say "no knowledge-base sources were found". For a
regulated user that is a false statement about their own documents: the search never ran.

- New: `server/routes/chat/retrieval-evidence-block.ts` — one function builds the evidence block from the
  retrieved sources **and** a retrieval status (`searched` | `unavailable`). An unavailable search produces a
  block that tells the model to say plainly the knowledge base could not be searched, and not to present the
  answer as grounded.
- `send-message.ts` sets `retrievalStatus = 'unavailable'` in the catch, passes it to the block, shows
  `UNAVAILABLE` in the context line, and records `retrievalMeta.status`.
- Test: `server/routes/chat/__tests__/retrieval-evidence-block.test.ts`.
  - `red/evidence-block.txt`: written before the module existed (import fails).
  - `green/evidence-block.txt`: 3/3, with the chat suites.

## R3 — a placement refusal is not a transient fault

`EnhancedEmbeddingService.embedBatch` retried every error `maxRetries` (3) times with growing back-off. A
`GatewayPolicyError` from the placement decision will not change on a second ask, so one decision was asked
three times, logged three refusals, and stalled each batch by seconds. Every other gateway path already treats
a policy refusal as terminal through `isTerminalGatewayError` (`server/services/ai-gateway/gateway-outcome.ts`);
`embedBatch` now uses the same helper (no second definition of "terminal").

- Test: `server/services/__tests__/enhancedEmbeddingService.policy-refusal.test.ts` — a refusal is asked once
  and rethrown unchanged, with no back-off; a transient `ECONNRESET` is still retried.
  - `red/embed-batch-refusal.txt`: on the unchanged service, `expected "vi.fn()" to be called 1 times, but got
    3 times`; the transient case passes (it is the behaviour kept).
  - `green/embed-batch-refusal.txt`: 46/46 across the new test, the embedding provider suites, the corpus
    policy and source-identity tests, and the chat route suites.

Note for test authors: `beforeEach(() => mock.mockReset())` returns the mock, and Vitest 4 runs a function
returned from `beforeEach` as that test's teardown — so a mock left throwing fails the test after every
assertion passed. Use braces.
