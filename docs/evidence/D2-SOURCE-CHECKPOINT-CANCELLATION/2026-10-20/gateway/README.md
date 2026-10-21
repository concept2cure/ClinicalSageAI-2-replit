# Native gateway source-operation cancellation proof

## What already exists

The real `AIGateway` already runs `beforeDispatch` after acquiring outbound capacity, normalizes a native aborted request into terminal `GatewayAbortedError`, avoids provider retries/fallback and failure accounting for that cancellation, and releases its real semaphore permit. The real source loader already issues frozen, identity-bound contexts through a private WeakMap and revalidates selected source bodies plus actor/program scope. Existing gateway/source-checkpoint tests qualify adjacent behavior. This proof uses those implementations and replaces only catalog/scope and outbound network I/O with synthetic fixtures.

## Baseline

At the contract baseline, the exported current-source assertion has two arguments. The new test uses an erased typed wrapper for the planned optional third per-call signal; the old implementation still compiles and ignores that argument. A genuine two-document context is first issued by `loadDraftProjectSources`. The assertion then runs in the real gateway's `beforeDispatch` while its first current-source read is held. A native Stop lands before that read resolves.

`baseline-raw.txt` preserves the complete unmodified combined Vitest output. `baseline-command.json` records exact arguments, working directory, Node 22 runtime, PATH prefix and 4 GiB heap setting. `baseline-pins.json` records the test and relevant production SHA-256 pins.

Result: **2 intended failures and 2 passing controls**. Both failures show the missing boundary precisely: after Stop, the baseline still reads the second selected document and invokes actor and program revalidation. The intended result is only the first current-source read and zero later scope operations.

All assertions before that deliberate failure already pass: the real gateway returns terminal `GatewayAbortedError` with phase `pre_call`, hides a custom abort reason, never dispatches canceled work, does not retry/fallback or record provider failure, and allows a queued control request through the released real permit. Passing controls exercise unchanged two-source revalidation and outbound dispatch with a non-aborted native signal and with a forged signal-like object supplied only to the source assertion.

## Scope and freeze

The owned test is `server/services/ai-gateway/__tests__/gateway-source-operation-cancellation.test.ts`. It uses real route/execute/semaphore/source-issuer/current-source assertion code. Catalog records, admission/scope responses and outbound provider responses are synthetic; no provider request, live SQL query or credential is required. `apiKey: 'not-used'` is a fixture sentinel. Canonical Vitest setup skips database startup connectivity checks; imported database initialization messages are not a live-database proof.

`lint-raw.txt`, `lint-command.json` and `lint-result.json` record scoped ESLint passing with `--max-warnings=0`. The frozen test SHA-256 is `9fc869adfdd795c5bb51175a5fedeecc081d02aa9cc00964bbe4de3a3e01b14e`. No production, compiler or Git operation was performed by this test owner. Root owns the production change and green rerun against these unchanged test bytes.
