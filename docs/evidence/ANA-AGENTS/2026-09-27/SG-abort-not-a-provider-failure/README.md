# SG: one Stop no longer marks Anthropic unhealthy for every tenant

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row). **Commit:** `b4efbe63c`. **Session:** `…019ZvHmh`.
**Recorded:** 2026-09-28, against HEAD `85cb5654b`. The fix shipped without
filed evidence, and this folder corrects that.

## What was wrong

A Stop that lands while a model call is in flight surfaces as the SDK's own
`APIUserAbortError`, whose `name` is plain `Error`. The gateway recognised a
cancel only as `GatewayAbortedError`, which was created only **before** a call
started. So a mid-call Stop:

- was retried;
- was re-run on every fallback rung;
- was reported to the person as "All model providers failed";
- counted against the provider's circuit breaker.

Three consecutive failures mark a provider unhealthy **for every tenant**.

`executeProvider` now converts any error thrown while the caller's own signal
is aborted into `GatewayAbortedError('in_flight')`, the type that `route()`
and the retry loop already treat as terminal.

## Proof

| Stage | File | Result |
|---|---|---|
| The committed test file (which throws the real SDK `APIUserAbortError`), against HEAD with `b4efbe63c`'s `gateway.ts` change reverse-applied | `red.txt` | 3 failed / 7 passed. The failures: "All model providers failed" instead of a cancel; the stopped request re-run **16 times**; **6** failures recorded against the provider (the threshold is 3) |
| HEAD, unmodified | `green.txt` | 10/10 |
| Overcorrection: every provider error treated as a cancel | `mutation-overcorrect.txt` | 1 failed: "a real outage was hidden". That guard stops the fix from hiding real outages |

The old test mocked the provider to throw `GatewayAbortedError` directly. That
is the one type the guard already caught, and it never occurs mid-call, which
is why the defect passed CI.
