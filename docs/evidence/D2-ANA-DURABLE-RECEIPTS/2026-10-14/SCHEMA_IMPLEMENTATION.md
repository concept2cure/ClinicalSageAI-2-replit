# Exact-source admission ledger schema

The implementation adds [one public integer-organization metadata table](../../../../migrations/20261014_ana_source_read_receipts.sql) and [a narrow Drizzle declaration](../../../../shared/schema/ana-source-read-receipts.ts). The lead registers the migration before the existing isolation tail and re-exports the declaration. No legacy receipt row is rewritten/backfilled and no source, programme, project or user FK can cascade into this ledger.

Database checks enforce version 2, the single host-budget checkpoint, positive actor/org/text length, lower SHA256 shapes, bounded canonical role/context text and one to eight exact-key sorted nonoverlapping ranges. Context limits use Unicode code points; Unicode Cc controls and unpaired surrogates cannot enter supported metadata (PostgreSQL text also rejects NUL/surrogates). This SQL shape validation complements the shared descriptor/fingerprint validator and canonical source admission; it does not compute/attest source contents, private-project authority or provider delivery.

Row UPDATE/DELETE and statement TRUNCATE guards refuse ordinary mutation. Only the exact existing NOLOGIN `ana_record_purger` role can DELETE through fixed owned functions. FORCE canonical tenant RLS is explicit and composes with the final tenant sweep. Precise actor/private-project scope is enforced separately in the current application facades; SQL tenant isolation is not described as that policy.

The new purge door requires unconditional platform scope, positive target, persisted pending-deletion state under an organization FOR SHARE reservation, a legal-hold table SHARE reservation and a fresh count of active tenant holds. Missing organization/hold records refuse. It returns the actual ledger DELETE count. PUBLIC execution is revoked; runtime `app_service` receives ledger SELECT/INSERT and function EXECUTE, and must not be a member of the purger role.

The lock privileges are deliberate: the NOLOGIN owner needs UPDATE(status) on organizations for its row FOR SHARE reservation, and table UPDATE on legal holds for its SHARE table lock. A sequential SQL probe demonstrated that a column UPDATE grant does not suffice for the table lock. The door body updates neither organizations nor holds, and runtime cannot assume the purger identity. Lifecycle integration reserves source stores before the outer organization/status/hold reservation; genuine writer/purge/hold races are independently reviewed.

## Owned evidence

- [Initial fail-first log](SCHEMA_RED.txt): the initial prospective table shape lacked mutation/range/tenant guards. Twenty-eight failures and three controls were observed. A later TypeScript check exposed Vitest array-argument expansion in range fixtures; that log is retained as historical preparation rather than full range-algorithm evidence.
- [Corrected precursor red](SCHEMA_PRECURSOR_RED_CORRECTED.txt): explicit synthetic unguarded-table reproduction using wrapped full range-list fixtures, 38 failures/two controls. This is a labelled engineering precursor, not a test on a client database or a claim that the old platform had this new table.
- [Hold-lock role red](HOLD_LOCK_PERMISSION_RED.txt): the full schema initially passed 39 controls and failed the actual NOLOGIN door at the legal-hold SHARE lock with permission error. [Probe](HOLD_LOCK_PERMISSION_PROBE.txt) distinguished column UPDATE denial from table UPDATE success before the grant fix.
- [Final focused green](SCHEMA_GREEN.txt): 40/40 sequential PGlite SQL controls, including populated replay, invalid protocol/text/ranges/C1 controls, direct mutation, viewer-labelled tenant RLS INSERT, foreign-tenant denial, runtime role separation, unavailable/active holds and exact authorized purge count.
- [Selected TypeScript](SCHEMA_TYPECHECK.txt): two owned roots, zero selected diagnostics; not whole-repository qualification.
- [Scoped lint](SCHEMA_LINT.txt): two owned roots; no errors/warnings.

These role/schema checks use an isolated PGlite SQL fixture with a synthetic non-superuser runtime role. The default fixture applier is privileged; direct private-sharing, ordinary PostgreSQL owner posture, two-session races and whole offboarding behavior belong to the independent genuine PostgreSQL/service evidence. No deployment, provider call or real client database operation was performed.

Reproduce the normal cohort with Node 22 and `node_modules/vitest/vitest.mjs run tests/schema-contract/ana-source-read-receipts.contract.test.ts --config vitest.config.ts`. The explicitly synthetic precursor uses `C2C_RECEIPT_SCHEMA_RED=1` for that same test only; the application migration applier has no such path or bypass.
