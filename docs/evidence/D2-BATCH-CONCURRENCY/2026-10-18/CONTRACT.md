# D2 / W2 — batch concurrency boundary

Date: 2026-10-18. Baseline: `e62320e0a9555188a08ce426d7c16c72d372d824`.

This repairs scheduling inside existing AnA batch drafting. No new surface,
provider, model, database schema, filing adapter, or output authority is added.

## Input contract

- Omitted (`undefined`) concurrency retains the default of 3.
- A supplied concurrency must be a finite positive integer number. Zero,
  negative, fractional, null, boolean, string, array, object, NaN, and infinity
  are invalid. JSON cannot represent NaN/infinity, but internal callers can.
- A valid value above 5 is capped to 5, retaining the existing HTTP limit and
  applying the same bound at the canonical service entrance.
- One pure resolver supplies both entrances. HTTP refuses invalid input with
  400 / `INVALID_BATCH_CONCURRENCY` before drafting or turn recording. Direct
  service calls reject with RangeError before reading/scheduling requests.
- Normal request order, section outcomes, trusted-source handling, tenant
  identity, termination metadata, and completed-sibling behavior are unchanged.

## Evidence before implementation

The route currently only upper-caps input. The service advances its loop by
an unchecked caller value. A negative increment prevents termination for a
nonempty request array. No live hanging call will be attempted. Tests exercise
the actual service with a request getter that throws if reached; this safely
proves whether invalid concurrency is refused before scheduling. Actual
Express route tests mock the downstream service and assert refusal before any
call. Frozen tests must fail against the baseline and pass after the repair.

Controls cover the default, 1, 3, 5, and upper capping, bounded overlapping
work, ordered results, and existing per-section failure/source/identity cases.
Run scoped ESLint, targeted Vitest, whole-project TypeScript through the normal
pre-push gate, and all normal Git hooks. No baseline increases or bypasses.

## Review and publication

Control tower owns this contract and Git. An independent read-only reviewer
checks compatibility and final source. Publish code and evidence directly to
`concept2cure-v2`, resolve incoming conflicts, and verify remote equality.
Cancellation propagation, quick-completion metadata, and server-owned save
receipts remain separately scoped needs; this change does not close them.
