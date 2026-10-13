# Reporting group membership tenant contract

This W1 / D2 repair keeps the existing reporting group table, routes and project
sharing policy. It introduces no group store or alternate reporting path.

`report_program_group_projects.organization_id` is a non-null integer and must
equal the organizations of both the exact group and exact project. The existing
foundation migration is amended in place because canonical deployment replays
it. It runs as its own BEGIN/COMMIT transaction; `applyMigrationFiles` detects
that boundary and does not wrap it in another transaction.

The migration refuses missing, unscoped or conflicting legacy parentage with
`REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED`. It fills only null child
tenant keys where both retained parents agree, then enforces NOT NULL and
validated immediate composite foreign keys. It never deletes or relabels a
foreign membership. Existing suitable parent unique keys are reused; matching
unvalidated foreign keys must validate, and incompatible same-name constraints
produce a named refusal. Existing cascade deletion behavior remains attached to
the same parents.

Both canonical membership writers record the session organization. Replacing
members scopes its child DELETE to that organization. Ownership, project access
and historical-access reads retain the child organization when traversing the
group. An optional client-workspace filter is included as a fixed bound SQL
clause only when selected; the organization predicate is always required.
Historical output still follows its recorded source projects, not a later group
membership list.

The canonical child-parent and integer tenant installers remain responsible for
FORCE RLS. Existing parent-derived policies remain meaningful because both
parents must now agree with the child's tenant; no invented test policy replaces
the installed one. Native tests cover actual runtime-role behavior, migration
replay, valid backfill, invalid retained rows and validated same-tenant keys.

Evidence is retained under
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/report-group-tenancy/`.
