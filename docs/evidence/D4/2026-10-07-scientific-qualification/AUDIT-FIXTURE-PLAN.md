# Adoption audit fixture correction

Workstream W3, launch evidence row D4. Existing adoption SQL regression only.

On source `cdc1308d97fa4564d799001f536fb423b9a5cc0e`, CI run
`37581683321`, Lint job `112662572066` failed the existing zero-baseline
audit-fixture guard. The adoption SQL fixture introduced in `0d15907bb`
declares only thirteen of the seventeen columns accepted by the canonical
audit writer. The omitted columns are `old_values`, `ip_address`,
`user_agent`, and `reason`.

Contract: add the missing nullable columns to that test fixture, preserving
all actual adoption SQL, transaction assertions and explicit audit-sealing
seams. No production audit behavior, guard, baseline or suppression changes.
This does not establish live HMAC, RLS or independent-connection concurrency
qualification.

RED: `npm run --silent ci:audit-logs-fixture` exited 1 locally and named the
same four missing columns in `projects-adoption-sql.test.ts`. Verification
after the correction must run that guard and the actual SQL adoption suite.
