# Retained Submission Operations digest boundary

The existing `/api/submission-ops/digests` readers have no production digest
generator. This remedy preserves retained rows and reports generation as
unavailable. It does not introduce a generator, delivery claim, schema, or new
product surface. No current UI calls these routes; the Insights executive
digest uses the separate canonical Reporting service.

The canonical implementation is
`server/services/submission-ops/digest-access.ts`. Both mounted digest handlers
use the authenticated organization/user and the request SQL connection. A
body-supplied identity or an old role claim cannot authorize access.

- Listing applies the exact recipient and currently accessible, uniquely
  anchored private program/project filters in SQL before pagination. It
  revalidates current access before returning records. An unavailable read
  produces an error instead of an empty successful inventory.
- A reader may mark their own digest read. Program/project and current
  permission dependencies remain reserved until the marker and its enlisted
  chained audit commit together. Another recipient, a foreign tenant, an
  unassigned private project, or revoked membership receives no digest content.
- A repeated read marker preserves the first recorded timestamp and reports
  `already_read`; it does not invent a new audit receipt.
- A lost COMMIT acknowledgement returns `DIGEST_READ_COMMIT_UNCONFIRMED` with
  exact scoped GET readback. The transaction owner discards the connection.
  There is no rollback claim after the COMMIT attempt and no automatic retry.

Responses preserve `data` and add `meta.digestGeneration`, whose status is
`unavailable` and code is `DIGEST_GENERATION_UNAVAILABLE`. Successful new markers
also carry `meta.readReceipt: marked_read` and the actual committed audit outcome.
The GET route accepts `digestId` for exact recovery within the same recipient
and current private scope. An empty result never establishes that no work is due.

The row projection uses the columns established by the deployed SQL creator,
`migrations/0002_phase15_submission_ops.sql`. Its absent `updated_at` column is
not selected or supplied with an invented historical timestamp. A database
provisioned through a schema push may additionally contain that column.

The companion PGlite/Supertest checks exercise actual creator SQL, mounted
handlers, current membership/sharing, private/recipient refusal, enlisted audit
rollback, idempotent readback, and synthetic before/after COMMIT transport loss.
Their audit adapter is explicitly synthetic; these checks alone do not qualify
native RLS, HMAC seals, physical socket eviction, or production deployment.
Native qualification uses fresh task-only tenants and retains every digest and
audit row. Qualification receipts are assembled separately by the control tower.
