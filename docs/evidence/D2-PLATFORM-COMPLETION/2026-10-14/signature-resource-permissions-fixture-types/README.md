# Signature permission fixture query types

Two fixture TypeScript errors came from PGlite query results defaulting to an empty row type while reading the `relation` alias from `to_regclass`. Both actual queries now declare their result row as `{ relation: string | null }`. SQL, missing-store injection, transaction rollback, cleanup, assertions and production source remain unchanged. No cast to a broad type or compiler-baseline change was introduced.

The exact same six suites passed all 90 tests with zero failures/skips in 14.23 seconds through `vitest.config.ts`, using Node v22.22.0 and a 4 GB heap. Forced scoped lint on the sole changed fixture returns zero errors and warnings. Whole-repository compiler validation remains root-owned; this workstream ran no compiler.

`manifest.json` pins the twelve relevant source/test files and both logs. The only source change from the previous phase is the two fixture type arguments; all other eleven pins match. The earlier 90-test phase and its red/green evidence remain unchanged. Raw logs are retained at the recorded `/tmp` paths. No index, commit, native database, provider, schema or signature-record mutation was performed.
