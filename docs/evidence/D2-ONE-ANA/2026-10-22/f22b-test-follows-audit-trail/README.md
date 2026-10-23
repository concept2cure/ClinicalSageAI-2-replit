# F22b's binding test follows the authoring audit trail (2026-10-22)

Row: D2. The F23 record (`docs/work-orders/README.md`, row 22) handed this on: `tests/authoring-market-document-binding.pglite.test.ts` has been red on trunk since `9a4da85005`.

## What already exists

- **The failure:** "creates the market's own Module 1 section" answered 500.
- **The product side:** since `9a4da85005` ("enforce assembly filing scope and section review provenance"), a section create writes its CREATE row to `authoring_audit_trail` and its secondary index row to `audit_logs`, in the same transaction (`server/services/authoring/authoring-evidence.ts`). It fails closed when either table is missing. That is correct.
- **The test's side:** its PGlite database had neither table. The sibling F22 suites already build `audit_logs` with `extractTableDdl('migrations/0000_sweet_joseph.sql', ['audit_logs'])` and `20260609_audit_hmac_seal.sql`, and this test now does the same.

## What changed

Test only. The test's database gains:
- `db/migrations/20260725_authoring_audit_trail.sql`;
- `audit_logs` from the base schema;
- the HMAC seal migration, with a test key.

No product file changed, and no assertion changed.

## Red, then green

- `red/before.txt`: the test as it was, at head. 1 of 7 fails with 500: `relation "authoring_audit_trail" does not exist`, then `audit_logs`.
- `green/every-suite-this-session-added.txt`: this test and the other 18 suites this session added for F14–F24 and their follow-ups, 130 tests. All pass at head.
