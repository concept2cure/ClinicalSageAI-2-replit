# CSR canonical SQL predicate proof

The new CSR source queries reuse the canonical Vault disposition and supersession builders. Their SQL interpolation allowance remains **zero**. The legacy baseline remains **1,028 interpolations across 215 files**; this work did not edit it or copy the canonical eligibility policy into the CSR services.

The guard now proves a narrowly defined fixed predicate separately from value interpolation. Recognition applies only to `server/services/csr/vault-source-input.ts` and `server/services/csr/source-receipt-eligibility.ts`. The TypeScript parser and checker establish all of the following:

- The direct call resolves to the unshadowed named value import `vaultDataEligibleSql` or `vaultBinaryAvailableSql` from `../document-data-disposition/eligibility.js`, or `supersededSql` from `../vault/vault-version-family.js`.
- The call has exactly one plain string literal argument, `'d'` or `"d"`. Dynamic aliases, other aliases, escaped spellings, extra arguments, optional calls, property calls, wrappers, and named import aliases receive no exemption.
- The call is the complete interpolation expression inside a direct first template argument to `.query`. Parser errors receive no exemption.
- Its `${` source offset was actually counted by the existing raw regex. Proofs are unique by offset. A nested template cannot subtract an expression the regex did not measure, and `sql.raw` remains counted.

The raw `countInterpolations` export is unchanged. Other files retain the previous behavior. TypeScript was already a development dependency; the classifier resolves only bindings in the two eligible source files, without loading their dependencies or accessing the filesystem. Every approved call is printed with its source location, builder, fixed alias and canonical import module, so the retained guard output identifies each subtraction.

The clinical source owner replaced the receipt reader's intermediate query variables with complete direct query branches, including fixed locking/nonlocking statements. The classifier does not approve conditional SQL fragments. Parameter values remain bind parameters.

Verification on Node 22.23.3:

| Check | Result | Retained evidence |
| --- | --- | --- |
| Guard before classifier/query-branch remedy | Failed on the two new CSR files, as expected | [Red before](csr-sql-predicates-red-before.txt) |
| SQL gate selftests | 23 passed; two historical blind shapes explicitly reported separately | [Selftests](csr-sql-predicates-selftests.txt) |
| Classifier and shared comment-stripper tests | 35 passed: 27 classifier and 8 comment-stripper | [Unit tests](csr-sql-predicates-unit-tests.txt) |
| Current repository guard | Passed; nine fixed canonical calls proved separately, baseline 1,028/215 unchanged | [Guard output](csr-sql-predicates-guard.txt) |
| Explicit lint including normally ignored CI files | Zero errors; 12 warnings, including existing CLI logging style and one helper complexity warning | [Lint output](csr-sql-predicates-lint.txt) |

Negative controls include request values alongside approved predicates, wrong import modules, caller paths outside the two reviewed files, parameter/block/destructuring/catch/function shadowing, dynamic or SQL-bearing aliases, type-only imports, property calls, wrappers, `sql.raw`, conditional SQL strings, malformed syntax, duplicate offsets and nested-backtick offset mismatches.

The broader gate still has its documented blind spots for SQL assembled in a variable and string concatenation. Those are retained as known gaps, not counted as passing safety cases. This change does not claim to solve them or qualify the wider legacy baseline.
