# P1-23 part (DP-10 residual): the tenant purge writes its own chained audit row

Item: P1-23, the "chained audit row for the purge" part. Finding: DP-10 residual
(`docs/security/SECURITY_AUDIT_2026-09-24.md` row DP-10, `PEN_TEST_SCOPE_2026-09-26.md` §4.2).
Audited at HEAD `0e58e794` on `concept2cure-v2`, 2026-10-01.

## What was wrong

`purgeTenant` (`server/services/tenant/tenant-offboarding.ts`) is the platform's one irreversible
operation on a tenant. Its module header promised "an explicit, attributable operator action with its
own audit entry", and the route's comment called the surviving `organizations` row "the audit trail
of the deletion". At HEAD the only record the purge wrote of itself was `logger.warn('Tenant purged')`.
No `audit_logs` row named who purged which organisation, when, on the strength of which export, or
what it deleted. A log line is not chained, not sealed and not retained with the records, so it does
not meet 21 CFR Part 11 §11.10(e).

The lane commits named in the item (`2ddb77b0` on 2026-09-24 and `c59ebc81` on 2026-09-29) made the
purge one transaction, added the legal-hold refusal and the truncated-export refusal, and made it erase
the Vault and its bytes. Neither wrote an audit row. `grep -n "audit_logs\|writeChainedAuditRow\|logAction"`
over the file at HEAD returns only comments. The red runs below confirm this.

Two smaller defects were found on the same path:

- **The purge accepted an actor of 0.** The route sends `Number(req.user?.userId ?? req.user?.id ?? 0)`.
  A request with no user id therefore purged a tenant and stamped `purged_by = 0`, so the destruction
  was attributed to nobody.
- **The request's IP address and user agent were never captured** for the purge.

## What is true now

- **One chained audit row per purge, written in the purge's own transaction.**
  `recordPurge` (`server/services/tenant/tenant-purge-audit.ts`, new, 96 lines) calls
  `writeChainedAuditRow` on the purge's checked-out client. It runs after the deletes and the status
  change, and before `COMMIT` (`purgeInOneTransaction` in `tenant-offboarding.ts`). If the row is
  refused, the error propagates and the transaction rolls back, so a purge whose audit row cannot be
  written does not happen.
- **What the row records.** `action = 'tenant_purged'`, `table_name = 'organizations'`,
  `record_id = <org id>`, `user_id = actor_id = <the platform administrator>`, `reason` = the stated
  offboarding reason, `ip_address`, `user_agent`. `new_values` (protected by the chain's payload hash)
  holds:
  - `organizationId` and `organizationName`;
  - `purgedBy` and `purgedAt`, which is the same instant as `organizations.purged_at`, read back via
    `RETURNING`;
  - the deletion request: `deletionRequestedAt`, `deletionRequestedBy`, `deletionReason`,
    `purgeEligibleAt`;
  - `retentionOverrideReason`;
  - **`exportManifest`**, the verified receipt that authorized the purge: `digest`, `tableCount`,
    `rowCount`, `exportedAt`, `exportedBy`;
  - **`deletedRows`**, the rows deleted per table as PostgreSQL counted them. For `vault.documents` this
    is the number of versions the `purge_tenant_vault_records` door returned;
  - `tablesAbsent`, the listed tables this schema lacks;
  - `totalRowsDeleted` and `vaultObjectsToErase`.
- **Which organisation the row is written under, and why it survives the purge.** The row goes on the
  **purged organisation's own chain** (`tenant_id` = the purged organisation). It survives for these
  reasons:
  - `audit_logs` is keyed by `tenant_id`, not `organization_id`, so the purge's uniform
    `organization_id = $1` predicate cannot match it.
  - It is in no purge list. `PURGE_CHILD_TABLES` keeps the audit trail out deliberately, see the
    comment above the list (it was at ~624 before this change).
  - `trg_audit_logs_no_delete` refuses any DELETE.
  - The `organizations` row it names also survives, in status `purged` (the comment above
    `purgeTenant`, which was at ~284).

  The route runs the purge as the runtime role in the platform scope. `audit_logs` is
  `FORCE ROW LEVEL SECURITY`, and its super-admin arm is what admits another organisation's row. The
  dbtest runs the full `PURGE_CHILD_TABLES` list exactly that way and finds the row afterwards.
- **An unattributable purge is refused** before anything is read or touched: error
  `PURGE_ACTOR_REQUIRED`, which the route maps to 403.
- **The route passes `auditContext`** (`req.ip`, the `user-agent` header) and returns `deletedRows`.
  A failed purge still answers 500 with a static body that contains no error text.
- `final_export_digest` is now stamped from the verified receipt's digest (the trimmed value that
  matched), rather than from the raw request string.

## Red / green

| Test | Red at HEAD `0e58e794` | Green after change | Mutant A: audit write removed | Mutant B: audit row written after COMMIT |
|---|---|---|---|---|
| `tenant-purge-audit.test.ts` › row on the transaction client, after the deletes and status change, before COMMIT | ✗ (no INSERT) | ✓ | ✗ | ✗ (INSERT after COMMIT) |
| › names who, which organisation, when, export, deleted counts | ✗ | ✓ | ✗ | ✓ (content unchanged) |
| › returns the counts it recorded | ✗ | ✓ | ✓ | ✓ |
| › refused audit row → ROLLBACK, no COMMIT, rejects | ✗ (resolved) | ✓ | ✗ | ✗ (COMMIT ran) |
| › refuses a purge it cannot attribute (0, -1, NaN, 1.5) | ✗ (resolved) | ✓ | ✓ | ✓ |
| › purge list names neither audit trail nor export receipt (pin) | ✓ | ✓ | ✓ | ✓ |
| `tenants-simple-purge-audit.test.ts` › passes the admin, IP, user agent | ✗ | ✓ | n/a | n/a |
| › unattributable purge → 403, not 409 | ✗ (409) | ✓ | n/a | n/a |
| › failed purge → 500 with no error text (pin) | ✓ | ✓ | n/a | n/a |
| `tenant-purge-audit.dbtest.ts` › one chained row on the org's own chain; chain verifies | ✗ (0 rows) | ✓ | ✗ | ✗ (row unsequenced) |
| › outlives the full purge list, run as the route runs it | ✗ (0 rows) | ✓ | ✗ | ✗ (RLS refuses the row outside the transaction) |
| › refused audit row → nothing deleted, still pending_deletion | ✗ (resolved) | ✓ | ✗ | ✗ (rows destroyed) |

Mutant B is the important one. Moving the write after `COMMIT` keeps the code looking audited, but
every DB case fails: the row loses its chain position, the route's connection loses the scope that
RLS admits, and a refused row leaves the tenant destroyed with no record.

Neighbouring suites are green and unchanged: `tenant-offboarding.test.ts`,
`tenant-isolation-tenants-simple.contract.test.ts`, `tenant-purge-vault-scope.pglite.integration.test.ts`
and `tenant-export-covers-purge.contract.test.ts` (57 tests). `tests/db/tenant-purge.dbtest.ts`
passes 12/12 against the change. ESLint on all six files reports 0 problems. The first cut had a
complexity of 17 on `assertPurgePermitted` and 529 code lines in the file; both were fixed by
extracting `assertPurgeAttributable` and moving the writer to `tenant-purge-audit.ts`.

Files: `red/unit-and-route.txt`, `red/dbtest.txt`, `red/mutant-A-write-removed.{unit,dbtest}.txt`,
`red/mutant-B-after-commit.{unit,dbtest}.txt`, `green/unit-and-route.txt`, `green/dbtest.txt`,
`green/dbtest-existing-tenant-purge.txt`, `green/neighbour-suites.txt`, `green/eslint.txt`.

## Purge coverage (reported, not changed)

`npm run ci:purge-coverage` (`scripts/ci/check-purge-coverage.mjs`) was run against the local
PostgreSQL 16 test database. `PURGE_CHILD_TABLES` is unchanged by this item.

- **609 of 681 org-keyed public tables are outside the purge's reach**: neither listed nor reached
  through an ON DELETE CASCADE. 72 are covered.
- The ratchet gate is **red at HEAD**, independently of this change. It finds 3 org-keyed tables that
  are new against the 611-table baseline: `ana_record_blobs`, `ana_turn_records` and
  `organization_retention_settings`. Lane P1-22-org has proposed adding the last one to the list
  (`../P1-22-org/proposed/tenant-offboarding.patch`); it is not applied here.
- The baseline lists 611 tables. 5 of them are absent from this database, so the gate carries them
  forward.

The gate stops at the first new table and does not print the total. The 609 figure comes from running
the same script, read-only, from a scratch working directory whose baseline is empty, so that every
residue table is listed. Outputs: `purge-coverage/gate-against-baseline.txt` and
`purge-coverage/full-residue-empty-baseline.txt`.

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
  server/services/tenant/__tests__/tenant-purge-audit.test.ts \
  server/routes/__tests__/tenants-simple-purge-audit.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run --config vitest.db.config.ts \
  tests/db/tenant-purge-audit.dbtest.ts tests/db/tenant-purge.dbtest.ts
DATABASE_URL="$TEST_DATABASE_URL" node scripts/ci/check-purge-coverage.mjs
```

Fixture rows: organisation 90623, its export receipt, its `tenant_purged` audit rows and the probe
table `purge_audit_probe_rows` are all removed by the dbtest's `afterAll`. The audit rows are removed
with the no-delete trigger lifted inside one transaction, the pattern the other dbtests use.

## Not done here

- `tests/db/tenant-purge.dbtest.ts` (organisation 90601, not this item's file) now leaves 6
  `tenant_purged` audit rows per run, because its `afterAll` never cleans `audit_logs`. They were
  removed by hand after these runs. The proposed fix is to add, to its `afterAll`, the same
  transaction-scoped delete as `removeFixtureAuditRows` in `tenant-purge-audit.dbtest.ts`, with
  `tenant_id = 90601 AND action = 'tenant_purged'`.
- The outcome of the post-commit byte erasure (`storageErasure`) is logged and returned, but not
  chained. It happens after COMMIT, so it cannot be made fail-closed with the purge.
- `requestDeletion` and `cancelDeletion` still write logger lines only. A cancelled offboarding leaves
  no audit row.
- If the status `UPDATE` matches no row, the purge still commits. This is unreachable on the route's
  scope today, but it is not refused.
- S3 old-version expiry, the third P1-23 residual, is Terraform and outside this item.
