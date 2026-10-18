# Platform role upsert arbiter: read-only defect and static correction proof

W1/D2-D3, 2026-10-14. Source frozen for the three pinned owned files. Native
mutation, migration replay and actual authenticated grant/audit follow-up are
**pending** the coordinated database slot. No compiler or publication claim is
made by this phase.

The local owned fresh strict QA database has only the table primary key; exact
grant INSERT EXPLAIN without ANALYZE returns 42P10. The older owned native QA
database has the canonical valid unique user/role index and plans the same
statement using it. Both owner-inspector transactions were READ ONLY and
rolled back. Duplicate groups are zero. This establishes a local provisioning
defect, not hosted CI database inspection or runtime grant/RLS success.

The existing replayed migration now creates the canonical full user/role index
and refuses a malformed named object. Its postcondition requires unique,
valid, ready, immediate, nonpartial, nonexpression and exact ordered keys.
Every existing RLS policy and canonical migration-set entry is preserved.
Duplicates refuse rather than losing retained rows; no DROP, row repair,
grant, baseline or permission relaxation was introduced.

The focused static contract first failed 3/4 assertions on the original
migration. A later test-pattern mistake matched the word “grant” in an error
message; its separate failed log is retained and labelled. After correcting
the pattern, the final immediate-index source passed **4/4**, zero skips,
0.591 seconds. Forced scoped lint reports **0 errors, 0 warnings**. The
unchanged migration DROP-safety and set-order guards both passed.

These static checks pin source relationships and deployment guard syntax;
they do not execute SQL. The exact final source pins, original read-only
snapshot pins, raw-log hashes and trailing-whitespace-only copy normalization
are recorded separately. All original /tmp artifacts remain intact.

Commands: `npx vitest run --config vitest.config.ts
tests/schema-contract/platform-role-grant-upsert-arbiter.contract.test.ts`;
`npx eslint --no-cache` for that one file;
`node scripts/ci/check-migration-drop-safety.mjs`;
`node scripts/ci/check-migration-set-order.mjs`.
