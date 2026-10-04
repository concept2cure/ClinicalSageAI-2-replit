# DP-75: a platform role grant commits with its record, or not at all

Date: 2026-10-01. Lane: D6 (security tranche 4). Found by the control tower while registering the P1-49 verifier's
residuals (the DP-58 class: a change recorded after it commits); re-read at head before it was fixed.

## What was wrong

`POST /api/admin/access/grants` (`server/routes/admin/access-management.ts`) designates platform personnel:
`support`, `platform_admin`, and the business tier `owner`, `business_admin`, `super_admin`. It wrote the
`platform_role_grants` row first, autocommitted, and then called `auditService.logAction`, which never throws and
whose failure the route discarded (the file had two entries in the discarded-audit-write baseline). So a grant of
`super_admin` could stand with no record of who granted it or why (21 CFR 11.10(e); SOC 2 CC6.2, CC6.3). A
revocation was recorded the same way.

Reproduced on PostgreSQL (`red/platform-role-grant-record.dbtest.txt`): with a trigger refusing the grant's audit
row, head answered **200** and the `platform_admin` grant stood.

## Decision (product owner and CSO)

- **A grant fails closed.** The grant and its chained row commit in one transaction, or neither does: 503
  `GRANT_NOT_RECORDED`, "Nothing was changed." Widening platform access with its record lost is worse than refusing
  it.
- **A revocation fails safe.** Withdrawing a platform role does not wait on the audit trail, as a platform suspension
  does not (`master-admin.ts`, WO-16C #133). Its answer now says whether the row was written (`auditTrail`, the
  canonical `recordAuditRow` outcome) instead of discarding it.

## What changed

- `server/routes/admin/access-management.ts`: `grantOnRecord` writes the grant and `writeChainedAuditRow` (tenant 0,
  the platform chain; the reason in its details) on one `transaction`; the route answers 503 when the row is refused
  and 500 when the grant itself fails. The revocation uses `recordAuditRow` and returns `auditTrail`.
- `scripts/ci/discarded-audit-write-baseline.json`: this file's two discarded writes removed (shrink only).

## Tests

| Test | Red (head) | Green |
|---|---|---|
| `server/routes/admin/__tests__/access-management.test.ts` (16 cases): the grant's row is the chained row on the transaction, after the INSERT, then COMMIT; a refused row rolls back with 503 and no internal text; a failed INSERT is a 500 with no row; a revocation reports `auditTrail`, and stands when its row is lost | `red/access-management.txt`: 7 failed | `green/access-management.txt`: 16 passed |
| `tests/db/platform-role-grant-record.dbtest.ts` (new, 4 cases), as `app_service` with RLS on, mounted behind `establishRequestSystemScope` as production mounts it: one chained tenant-0 row with the reason; a refused row leaves no grant and no row (503); a revocation stands with both rows on the chain | `red/platform-role-grant-record.dbtest.txt`: 2 failed (head answered 200 and kept the grant) | `green/platform-role-grant-record.dbtest.txt`: 4 passed |

Neighbours: every suite under `server/routes/admin/__tests__`, 105 passed. Gates: `ci:discarded-audit-write` (no new
occurrences), `node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression` (228, unchanged). ESLint: the
grant handler's complexity warning predates this change (one warning, as at head).

## What remains

- `PATCH /api/organizations/:id/settings` (DP-73) is the other change in the DP-58 class still recorded after it
  commits.
