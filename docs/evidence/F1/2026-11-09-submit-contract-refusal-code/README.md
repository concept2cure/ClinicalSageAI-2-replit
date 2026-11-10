# The submit contract test follows the refusal its route now gives (F1, 2026-11-09)

**The finding.** `test:proof-tier` had one failure outside S12's file, reported by the CMC session in COORDINATION.md.
In `tests/schema-contract/c2c-document-submit-requires-filing.contract.test.ts`, the case "a sequence that is still
draft is not a filing" failed:

```
expected 'SEQUENCE_NOT_FILED' to be 'SEQUENCE_NOT_DISPATCHED'
```

## What already exists (RULE 3)

- **The route.** `server/routes/c2c/documents.ts` `POST /:id/submit`. Since RIM's `b6793c57ca` (2026-11-09), it asks
  the one filed rule, `isFiledDispatchStatus`. A sequence the agency has not received answers
  `409 SEQUENCE_NOT_FILED`, with one sentence ending "Nothing was submitted."
- **The old code.** `b6793c57ca` says nothing in server, client or shared reads `SEQUENCE_NOT_DISPATCHED`. This
  contract test was the one place that still did. That commit updated the route's own PGlite suite but not this one.

## The change

Only the test. The case now expects `SEQUENCE_NOT_FILED`, and checks that the refusal's sentence ends "Nothing was
submitted." The other assertions are unchanged: the status stays `approved`, and no ledger row is written. The route is
unchanged.

## Red, then green

- **At HEAD:** 1 failed, 6 passed, with the message above.
- **After:** 7 of 7 pass, and ESLint is clean.

**What remains in `test:proof-tier`:** `authoring-migration-list-closure.contract.test.ts`, about S12's
`section-sources-unverifiable-native.pglite.test.ts`. It was sent to S12 on 2026-11-09.
