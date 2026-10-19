# D5 — a status change that is not a signature commits with its provenance event (audit lead #10)

`PUT /projects/:projectId/artifacts/:artifactId/status`, for the transitions that
are not signatures (review → draft, approved → review, locked → draft,
draft → review), wrote the status and then the provenance event as two
autocommitted statements. When the event failed, the change stayed and the route
answered 500 over it: an unlock or a return to draft with no record of who made
it. The signed branch beside it already commits both together.

**Change:** `server/routes/c2c/artifacts.ts`, the unsigned branch only. The
update and the provenance insert now run in one `db.transaction`, as the signed
branch's do.

**Proof** (`server/routes/c2c/__tests__/artifact-approval-ceremony.pglite.integration.test.ts`,
four new cases on PGlite against the real route). The test went in first, against
the unchanged route:

| | Result |
|---|---|
| red: route unchanged (`red/route-unchanged.txt`) | 2 failed, 20 passed: `answered 500 over a committed status change with no provenance`, for review → draft and approved → review |
| green: as committed (`green/ceremony.txt`) | 22/22 |
| green: the five mock-db suites that drive this route (`green/mock-db-callers.txt`) | 73/73 |

The fix was reviewed before it was applied, from three angles: other callers'
mocks, whether the test bites, and types and lint. None found a defect. The route
file was in another lane's 24-hour window until 2026-10-18 23:02 UTC, and this
change waited for it.
