# W1 / D2 actual query interfaces and fixture shape

The permission scope/list/grant/revoke helpers use only the existing
`RequestSqlClient` query surface, matching the permission decision. A transaction
can now grant reviewers and resolve scope directly; the route no longer casts
its transaction to a full PostgreSQL pool. The retained permission row is an SQL
record with its existing named fields. No decision, role, SQL or lock changes.

The catalog executor permits an optional `rowCount`, because its operations
consume rows rather than requiring an affected-row count. This admits the
canonical Drizzle transaction adapter without inventing a count. Conversely,
the journey harness now declares the actual `rowCount` its existing shim already
returns; its implementation is unchanged.

The figure fixture uses typed real PGlite records and supplies the required
audit IP/user-agent fields. The governed working-copy fixture constructs the
known export document fields explicitly instead of spreading unknown module
metadata into the renderer contract. The compositor summary's previously
missing type field is covered by the separately retained projection regression.

The final run passed 135 tests across seven real import, image, workflow-release,
object-permission, review, coauthor and summary test files. Scoped ESLint has
zero errors and 23 pre-existing router warnings. These tests overlap earlier
evidence and their counts should not be added to it. The control tower owns the
whole-tree compiler, build and publication checks; this session did not run them.

Logs: `regressions.txt` and `scoped-lint.txt`.
