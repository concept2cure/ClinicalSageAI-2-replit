# A health probe that could only say "operational"

**Row** D6 (honest state on a mounted operational surface). **Date** 2026-10-12.

## The defect

`server/sage-plus-service.ts`'s `healthCheck()` returned
`status: 'operational'` **unconditionally**. The database probe's result went
into `databaseConnected`, its failure went into the log, and the status said
operational either way — when `SELECT 1` threw, when it answered no rows, and
when there was no pool at all.

That field is not cosmetic. `server/routes/health.ts` makes it a conjunct of
the deep check's verdict:

```js
const isHealthy =
  (databaseResult.status === 'ok' || databaseResult.status === 'not_configured') &&
  sagePlusResult.status === 'operational' &&          // ← could never be false
  circuitBreakers.validator !== CircuitState.OPEN && …

res.status(isHealthy ? 200 : 503).json(healthReport);
```

A conjunct that is always true contributes nothing, so that line was dead, and
`services.sagePlus.status` reported "operational" to any monitor reading it
while this service could not reach the database. The aggregate verdict survived
only because `databaseResult` is probed separately on the same request — so the
endpoint was not wrong overall, but one of its four dependency signals was
decorative, and the one a reader would key on.

This is the class CLAUDE.md names: *"Fail closed, never fabricate … An error is
never rendered as an empty result."* Here it was rendered as **success**.

## Why the existing suite missed it

`server/routes/__tests__/health-5xx-containment.test.ts` has a case named *"a
failed SagePlus probe degrades to 503 without the thrower text"*. It passes. It
drives the path by mocking `healthCheck` as a **rejection**:

```js
sageHealth.mockRejectedValue(new Error('SENTINEL-SAGE-DETAIL getaddrinfo ENOTFOUND …'));
```

That proves `routes/health.ts`'s catch branch, which is real and worth keeping.
But the production function never throws — it catches internally — so the state
that test asserts is one the code under test cannot produce. The suite was
green on a contract the implementation did not have.

## The fix

Three states, derived from what was measured, with the vocabulary deliberately
matching the database row in the same handler so a missing pool does not turn a
dev or test environment into a 503:

| measured | status |
|---|---|
| `SELECT 1` returns rows | `operational` |
| `SELECT 1` throws | `degraded` |
| `SELECT 1` returns no rows | `degraded` |
| no pool at all | `not_configured` |

`pool` is genuinely nullable — `server/db/runtime.ts` leaves it null when
neither `DATABASE_URL` nor `DATABASE_NEON_NEW_SECRET` is set, and when
initialisation throws — so that fourth row is a real state, not defensive
padding.

`routes/health.ts` accepts both `operational` and `not_configured`, through a
`SAGE_PLUS_HEALTHY` Set rather than a disjunction: the `||` took the handler's
cyclomatic complexity 26 → 27, and a Set membership test is a call rather than
a branch, so it keeps the number where the ratchet had it. Confirmed: the file
carries the same three warnings as HEAD, at the same counts.

**No failure detail is returned.** The caller's own `probeFailed` keeps driver
text out of the response body ("the detail is in the server log") and its suite
asserts that; a message field here would be a second, unguarded route for
`getaddrinfo ENOTFOUND …` into a public health payload. One of the new cases
pins that the returned object has exactly three keys.

## Verify by making the check fail

`server/__tests__/sage-plus-health-reports-what-it-measured.test.ts`, 5 cases
against the REAL function — the one the existing suite mocks away.

As shipped:

```
 ✓ operational when the database answers
 ✓ degraded — NOT operational — when the database probe throws
 ✓ degraded when the database answers but returns no rows
 ✓ not_configured when there is no pool at all, so a dev environment is not an outage
 ✓ never returns a failure detail, so driver text cannot reach a health payload
 Tests  5 passed (5)
```

With the constant put back exactly as it was — **3 failed:**

```
× degraded — NOT operational — when the database probe throws
    → expected 'operational' to be 'degraded'
× degraded when the database answers but returns no rows
    → expected 'operational' to be 'degraded'
× not_configured when there is no pool at all, …
    → expected 'operational' to be 'not_configured'
 Tests  3 failed | 2 passed (5)
```

The two that still pass are the two the old code happened to get right: the
healthy case, and the no-detail case (a constant leaks nothing).

Restored: 25 tests pass across the four suites that touch health or
`sage-plus-service`, `health-5xx-containment` included — its catch-branch case
still holds, because that branch is still real for any future probe that does
throw.

## Found alongside, recorded in WO-19 §2

The same module holds two unreachable functions that fabricated rather than
failed, both now honest: `getKnowledgeDocuments` returned a synthesized
document row (`title: 'Database connection required', status: 'active'`) when
the pool was null, and `getComplianceStatus` returned `{ status: 'pending',
issues: [] }` for an absent row AND for a missing pool — a compliance verdict
with an empty issue list, synthesized by a service. Neither has a caller;
`routes/health.ts` imports `healthCheck` alone. Both were safe to change for
that reason, and the measurement behind the table they read —
`knowledge_documents`: no writer, no seed, no model, 0 rows — is why keying it
would have been the wrong symmetrical move. That decision is
`docs/work-orders/WO-19-graphrag-reads-are-inert.md` §2.
