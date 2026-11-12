# GA-DEMO-04: AnA's reads survive failed turns

Package **F1**. GA ledger item `GA-DEMO-04` (lane L2, GA blocker, unheld). Filed 2026-11-12.

## What already exists (RULE 3)

| Piece | Path | State before |
|---|---|---|
| The breaker and its middleware | `server/middleware/circuitBreaker.ts` | Counted every 5xx for the life of the process. Nothing counted a success. A success while half-open did not close it. |
| The AnA breaker | `server/startup/routes.ts` (`createAiCircuitBreaker`: 10 failures, 30 s), mounted on `/api/ana-ri` in `server/bootstrap/register-ai-routes.ts` | Guarded every method on `/api/ana-ri`, reads included. |
| The no-provider answer | `server/routes/ana-ri/stream.ts` (503 `GATEWAY_UNAVAILABLE`) | Counted as a failure of the provider. |
| Its tests | `server/middleware/__tests__/circuitBreaker.test.ts` | Pinned failure detection only. |

Nothing is added beside these. The fix is inside the existing breaker.

## The defect, reproduced on the running app

With no model key, every turn answers 503 "No AI providers available". After ten such turns the breaker opened.
From then on each turn, and every read on `/api/ana-ri`, answered "Service ai-service is temporarily unavailable".
The person lost the honest reason and their conversations. `before-running-app.txt`.

With a key the same happened more slowly: ten provider errors over any length of time, however many successes
between them, opened the circuit, and each later error reopened it for 30 s.

## What changed

- **Consecutive failures.** A response below 500 resets the count, and closes a half-open circuit.
- **An expected unavailable state is not a failure.** `markExpectedUnavailable(res)`; the stream's no-provider answer
  calls it. The person keeps getting that answer.
- **Reads pass.** A new middleware option, `passReads`, set for the AnA breaker: GET, HEAD and OPTIONS are neither
  refused nor counted. Reads on `/api/ana-ri` call no model. The option is off by default, so other uses of the
  middleware are unchanged.

## Red, then green

Five new cases failed before the change (a success between failures; a success while half-open; the marked
response; reads under an open circuit; the AnA breaker's own setting) and pass after. The file's five existing
cases pass before and after. With `health-5xx-containment.test.ts`: 15 of 15. Typecheck 0 errors; lint warnings
net -1.

## The running app, after

Same script, same twelve turns: every turn answers "No AI providers available", and the read after them is served
as it was before them. `after-running-app.txt`.

## Limits

- The read used in the script is a path that is not an endpoint (it answers 404). It shows the breaker refuses or
  passes the request; it is not a walk of the conversation list in a browser.
- Not exercised with a real model key: a provider that fails and then recovers. The half-open case is covered by
  the unit test only.
- Other no-provider answers behind this breaker, if any exist outside `stream.ts`, are still counted as failures.
  Only the stream's was found on `/api/ana-ri`.
