# Independent saved-source candidate query review

This evidence reviews exactly the 16 candidate-selection and ordering scenarios
reported to the lead session. The runner extracts the static `latest()` CTE
from `server/services/authoring/authoring-saved-assembly-sources.ts`; it does not
reimplement that query. `candidate-query.sql` retains the exercised SQL and
`raw-run.json` retains its unmodified output. The retained replay ran after the
backend owner declared production frozen.

All 16 scenarios pass on an in-memory PGlite database. An admitted empty result,
one pair, a record beyond 500 unrelated events, and the newest numeric sequence
are selected as expected. Null or zero positions, orphaned records, duplicate
links or positions, damaged operation labels with retained source metadata,
malformed section-level source events, wrong parent identity and a foreign
tenant's chain counterpart refuse ordering validation. A refused summary may
contain an internal candidate identity; the service checks `ordering_valid`
before using or returning that candidate.

The review identified two implementation risks and the backend owner corrected
them: damaged operation labels must not hide retained source intent, and the
final source/latest checks must follow the remaining record/access reads.
The reader also uses the existing single-row chain verifier, exact parent and
tenant envelope checks, direct JSON payload hashing, the canonical whole-document
read scope, and exact selected-source revalidation. These are code-review
observations. This runner executes only the candidate-ordering query. It does
not execute or qualify the HTTP route, chain/hash verification, source ACLs,
document ACLs, zero-write GET behavior or the full reader. Those checks belong
to the backend owner's separate HTTP/PGlite suite.

The minimal tables preserve the queried UUID, JSON, bigint and tenant types.
They omit production indexes and immutability triggers so malformed duplicate
records can be exercised. This is neither native PostgreSQL scheduling nor RLS
qualification, a tenant-chain walk, a provider call, deployment or human testing.

`proof.json` records the command, source/query/artifact hashes and zero-error,
zero-warning lint and Node parse checks. Before/after source hashes match.
The exercised query hash matches the earlier independent 16-scenario review;
the backend's later guard extraction did not change the query. No production
or product test fixture was edited by this reviewer.

From the repository root, with the existing Node 22 toolchain on `PATH`:

```sh
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/saved-source-reuse/backend-review/review-query.mjs
```
