# Existing sponsor registry: governed HTTP editing and exact receipts

## What already exists

`server/routes/ind-master-data.routes.ts` already mounts tenant-scoped sponsor,
agent and investigator CRUD. `server/services/ind-master-data/ind-master-data-service.ts`
already writes the IND sponsor registry and reports its ancillary audit outcome.
`shared/schema/ind-master-data.ts` already stores name, DUNS and contact fields.
This completion adds validation, reasons, exact revisions and CAS to the reached
sponsor path. Agents/investigators and the existing committed-mutation plus
explicit ancillary audit-outcome policy are preserved.

## Results

- `red.log`: original code, governed sponsor HTTP cases: **19 failed, 13 passed**.
  It accepted missing reasons/malformed facts and could not prove exact revisions
  or refuse stale/concurrent updates.
- `red-audit-bounds.log`: **1 failed, 32 skipped**. An oversized legacy business
  fact was copied unbounded into audit details. Oversized prior facts now retain
  their length and SHA-256 with an explicit omission marker, never an invented
  shortened prior value.
- `green.log`: **48 passed in 3 files**. Real in-process PostgreSQL/PGlite
  persistence, HTTP auth/role/tenant boundaries, canonical validation, partial
  drafts, full six-digit timestamp precision, revision CAS, concurrent saves,
  reason/before/after audit detail, and a committed row with a failed ancillary
  audit receipt. Existing direct-service callers without governance options and
  unchanged agent/investigator CRUD remain exercised.
- `lint.log`: exit 0, no warnings/errors for all four changed source/test files.
- `inputs.sha256` pins the registry worker's final scoped source/tests. The
  shared PGlite harness is under the program worker's scope; final integrated
  evidence must pin/replay its final contents too.

Command: Node 22.23.3, `NODE_OPTIONS=--max-old-space-size=4096 npx vitest run
--config vitest.config.ts server/routes/__tests__/ind-master-data.contract.integration.test.ts
server/services/ind-master-data/__tests__/ind-master-data.test.ts
server/services/ind-lifecycle/__tests__/ind-persistence-pglite.integration.test.ts`.

The raw Sponsor response includes an opaque `revision` generated with PostgreSQL
`to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.
HTTP POST/PATCH require an 8–2000 character reason; PATCH also requires the exact
`expectedRevision` from the last read. A conflict returns 409 with
`SPONSOR_REVISION_CHANGED`. Writes advance the database timestamp monotonically
at full precision. A saved sponsor with `auditTrail.persisted=false` remains a
saved sponsor; the UI must show the receipt and reconcile, not retry blindly.

No native PostgreSQL, deployed human witness, agency acceptance or full Stage 4
qualification is claimed by this scoped worker evidence.
