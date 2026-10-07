# Independent saved-source tenant consistency follow-through

W3/D4 read-only review of the integrated saved-source reservation/export and
disposition increments found an inherited loader gap on the newly qualified
source-admission boundary. `loadDocumentForOrg(..., currentOnly: true)` proves
the owning program's tenant but does not check the document's recorded tenant.
An actual in-memory SQL probe returned a TEST-ONLY legacy document with
`organization_id: 2` through a program owned by organization 1. Canonical
disposition already refuses this conflicting recorded scope.

Control tower approved a bounded correction on 2026-10-07. Root owns the
loader production change and existing catalog regression. This worker owns
only the new actual-PGlite getter/verifier test and this evidence. Current-only
source admission must require the document's recorded organization to equal
the verified request organization. A null recorded organization fails closed.
Matching scope remains usable; historical
reader policy is preserved. No tenant is guessed or rewritten.

New test:
`server/services/vault/__tests__/saved-source-tenant-consistency.pglite.integration.test.ts`.
It uses existing Authoring/Vault prerequisites and actual canonical catalog
and disposition migrations. The positive fixture has exact matching hash,
complete extraction span and usable catalog. The legacy-conflict fixture
changes only the recorded document organization, retaining the valid program
and catalog. A second negative fixture has a null recorded organization.
Both the actual getter and actual saved-source verifier run SQL
through the PGlite executor; the global pool stub is not their executor.

RED ran before root changed production: **2 failed / 1 passed**, 9.35s.
`SOURCE-TENANCY-RED.txt` captures actual getter returns and verifier resolution
for both inconsistent recorded scopes; the matching-tenant positive passes.
Fixture identity/hash uniqueness errors from two earlier attempts are retained
in `SOURCE-TENANCY-FIRST-RED.txt` and `SOURCE-TENANCY-SECOND-RED.txt`. Those
fixture errors are not counted as product proof. Every case now has its own
unique document code and content hash.

Reproduce:

```sh
npx vitest run server/services/vault/__tests__/saved-source-tenant-consistency.pglite.integration.test.ts --reporter=verbose
```

Root's scoped loader correction appends `d.organization_id = $2` alongside
the existing current-version predicate only when `currentOnly` is requested.
This excludes both foreign and null recorded organizations without changing
historical reads. Saved-source verification already opts into current-only
reads and reuses that SQL through its transaction executor.

GREEN after that correction: **3 files / 30 cases passed**, 13.99s, covering
the new getter/verifier cases, existing actual catalog current-version SQL,
and the saved-source reference contract. `SOURCE-TENANCY-GREEN.txt` records
the executed command's results. New test ESLint exits 0 with **0 errors /
0 warnings** (`SOURCE-TENANCY-LINT.txt`; the npm environment warning is not
a lint diagnostic). `git diff --check` passes. No worker production changes
or commit/push.

```sh
npx vitest run server/services/vault/__tests__/saved-source-tenant-consistency.pglite.integration.test.ts server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts server/services/authoring/__tests__/draft-source-references.test.ts --reporter=verbose
npx eslint server/services/vault/__tests__/saved-source-tenant-consistency.pglite.integration.test.ts
```

The independent review also inspected saved-source reservation, the actual
export SELECT and reserved audit/render callback, disposition saved-draft
impact SQL and direct derived-impact SQL. No additional reproducible defect
was identified in those paths. The final filing-snapshot regression was
owned separately by intake and is not counted in this worker's evidence.
Earlier read-only neighbors passed 5 files / 61 cases (17.15s), plus the
12-case catalog SQL file (5.89s), before this tenancy correction.

This is SQL/admission consistency qualification, not runtime-role RLS,
independent connection concurrency, full-tree semantic TypeScript or final
release qualification. Control tower owns the integrated checks.
