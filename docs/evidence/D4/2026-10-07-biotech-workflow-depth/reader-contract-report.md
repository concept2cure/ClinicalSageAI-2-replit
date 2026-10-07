# W2 / D4 — canonical submission inventory read contract

The pushed source `d4ab79436bfaaeb8b83d6a12a96ddd6be1d71dd8` failed the canonical GitHub TypeScript gate: [C2C run 37564734875](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37564734875), job 112609745977. Its single TS2322 finding was the schema-bearing runtime database passed to `loadSavedSubmissionInventory` in `server/services/ana/submission-package-tool.ts`.

The inventory is read-only, but its database argument inherited `CanonicalStoreHandle`, including an empty-schema transaction callback contract. Drizzle's `select` method is compatible across schema-bearing databases and transactions; the full transaction callback is schema-dependent. The caller was therefore required to satisfy a write/transaction capability it never uses.

The correction exports `CanonicalStoreReader = Pick<CanonicalStoreHandle, 'select'>` from the existing canonical store and uses it only for `loadProjectionInput` and the inventory's database input. `CanonicalStoreDb`, `CanonicalStoreHandle`, all writer/transaction signatures, the canonical queries, organization/project predicates, lifecycle interpretation and package limits are unchanged. No cast, extra ORM/pool, dependency or typecheck baseline change was added.

`tests/regulatory/submission-inventory-reader-contract.test.ts` runs a bounded TypeScript program using the production exported type aliases, actual inventory argument type, the real `canonicalDocuments` table and Drizzle declarations. It does not import the runtime/application graph. It verifies a schema-bearing database satisfies the read contract; its negative case still verifies that the original full transaction handle is incompatible (TS2322), so the full store's schema contract was not erased.

- `reader-contract-red.txt`: the original inventory argument failed with TS2322; the negative full-handle test passed (1 failed, 1 passed).
- `reader-contract-green.txt`: 18 tests passed in three files: bounded compiler contract, real-SQL PGlite inventory and active-project Anna tool behavior.
- `reader-contract-lint.txt`: zero ESLint errors; the existing `persistState` max-parameters warning remains.
- `git diff --check` passed for the owned source and test files.

No local whole-project typecheck ran. The next pushed-source GitHub canonical gate must confirm the complete application typecheck; the bounded contract and runtime tests do not claim that gate has already passed.
