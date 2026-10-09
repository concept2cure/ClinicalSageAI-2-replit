# D6: a tenant purge is all or nothing, stops at a legal hold, needs a complete export, and erases the bytes, 2026-09-24

**Launch row:** D6, security posture: the per-tenant data-retention statement.
**Lane:** D6 tenant purge, claimed in `docs/work-orders/README.md`. It covers
the "→ tenant offboarding, unclaimed (D6)" findings, confirmed by the vault
re-baseline (`docs/evidence/D6-EXPORT-COVERS-PURGE/2026-09-24/`, "Not done").

`purgeTenant` (`server/services/tenant/tenant-offboarding.ts`) is the one
irreversible act in offboarding. It destroys a customer's regulatory records
(IND applications, submissions, protocols).

## What was wrong

| # | Defect | Measured at HEAD (`red/at-HEAD.txt`) |
|---|---|---|
| 1 | BEGIN / COMMIT / ROLLBACK went through `pool.query`, which may take any connection for any statement. The deletes were not in the transaction the BEGIN opened. | A purge that failed on its last table had already deleted the earlier tables' rows **and the vault document records**: "a failed purge must destroy nothing: expected 0 to be 1". |
| 1b | "A table this schema lacks is skipped" cannot work inside a real transaction, where any error aborts it. | The skip left 1 row where 0 were expected. |
| 2 | No legal hold was consulted, although `vault.legal_holds` exists. | With an active hold, the purge resolved and destroyed the rows. |
| 3 | A truncated or partly failed export still recorded a receipt, and the receipt is what authorizes the purge. | Both incomplete exports were `recorded: true`. |
| 4 | The purge deleted vault records but not their stored bytes. The code said so in an "HONEST SCOPE" note, and it described the storage layout from before the provider. | `storageErasure` was undefined, and the bytes were still on disk. |

## The change

- **One transaction on one checked-out client.** Each table is deleted behind
  a savepoint, so skipping a missing table rolls back that one statement and
  nothing more. The client carries the request's scope: the route runs under
  the system scope, `/api/tenants` in `SYSTEM_SCOPE_PREFIXES`.
- **`assertNoActiveLegalHold`** runs inside the transaction, so a hold placed
  after the preflight checks is still seen. Any unlifted hold on the tenant
  gives `LEGAL_HOLD_ACTIVE` (409). A lift must already carry who lifted it and
  why; the table's own CHECK requires that. A deployment without the vault
  schema has no hold table and so no holds. Any other read failure aborts.
- **`recordExportReceipt`** takes the export's coverage report and writes no
  receipt when a table failed to read or was truncated. It returns
  `incomplete: {tablesFailed, truncatedTables}`, and the route already puts
  the receipt beside the digest, so the caller sees it. That digest then
  cannot open a purge (`EXPORT_EVIDENCE_UNVERIFIED`).
- **The bytes.** Inside the transaction, and only when `vault.documents` is
  among the tables purged, the purge reads each provider-backed document's
  version id and recorded provider. After COMMIT, never before, it deletes each
  from the store it was saved in (`getStorageProviderFor`). The purge returns,
  and the route reports, `storageErasure: {objects, deleted, notDeleted}`.

## Proof

`tests/db/tenant-purge.dbtest.ts` runs on PostgreSQL 16 built by install-fresh
and deploy-migrate. The part-way-failure cases use a pool whose `query()`
takes a fresh connection for every statement, as pg's Pool allows. The
failing table is a probe with a BEFORE DELETE trigger that raises.

| Case | HEAD | After |
|---|---|---|
| Part-way failure leaves the tenant untouched | ✗ | ✓ |
| A complete purge removes the rows and marks the tenant purged | ✓ | ✓ |
| A missing table is skipped | ✗ | ✓ |
| An active legal hold refuses and destroys nothing | ✗ | ✓ |
| A lifted hold does not block | ✓ | ✓ |
| A truncated export records no receipt, and its digest opens nothing | ✗ | ✓ |
| An export with a failed table records no receipt | ✗ | ✓ |
| A complete export records one | ✓ | ✓ |
| Bytes are deleted from their recorded store after the commit | ✗ | ✓ |
| Bytes and records survive a purge that fails part-way | ✗ (the records were gone) | ✓ |
| Bytes of records a purge does not remove are left | ✗ | ✓ |

The totals are 3/11 at HEAD and 11/11 after (`green/after.txt`). The offboarding
and export unit suites still pass, 98/98; the fake pool gained `connect()`.
tsc reports no errors. The ratchet is unchanged. The tenant-isolation gate
has the same 8 candidates, none in these files.

## Not done

- **The data return carries no document bytes, only rows.** Whether the
  customer's return should include the files themselves, and in what form, is
  a product decision for the founder, not a defect fix.
- **Bytes the purge cannot reach.** Rows written before the storage provider
  carry a legacy `uploads/` path and no version id. `rendered_leaf_files` holds
  version ids with no recorded provider. Neither is deleted, and the code says
  so.
- **Retrying a `notDeleted` object** is left to the operator. The ids are
  returned and logged.
