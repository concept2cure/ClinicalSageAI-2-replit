# D3: generated drafts were readable, and rewritable, from any tenant scope

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-28. The row was claimed before any change. I found this while
working the hand-on from `../2026-09-28-users-rls/` about the children of
`public.users`.
**Database:** `c2c_d3u`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service`, which
is not a superuser and has no BYPASSRLS, with `RLS_ENFORCE=on`
(`posture.txt`). A second database, `c2c_d3w`, was provisioned from blank after
the change (`green/from-blank.txt`).

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, which is owed with D1.

## The defect

`public.drafting_tasks` holds generated regulatory drafts: the document title,
the eCTD section and the draft text. It names its program by a **text**
`project_id` that points at a `regulatory_programs` row, but there is no
foreign key and no organization column. It had no row-level security.

Its two routes are `POST /api/v1/drafting/start_task` and
`GET /api/v1/drafting/task_status/:task_id` (`server/routes/misc-inline-routes.ts`).
Both already read and write it only through the program's ownership, with the
session's organization in the SQL (audit findings API-01 and IAM-11). The table
itself enforced nothing.

Measured as `app_service` in tenant A's request scope (`red/before.txt`, 3 of 7
fail):

- **B's draft was readable** by task id, by program id, and by scanning the
  content.
- **B's draft was rewritten and deleted** (1 row each).
- **A task was filed under B's program, and under no program at all** (1 row
  each).

The routes' own cases passed both before and after (positive controls). The
routes were never the hole; the table was.

## The change

**`db/migrations/20260813_child_table_parent_scoped_rls.sql`, amended in place**
(Rule 1), with a dated header note. One line was added to the spec list:
`drafting_tasks` → `regulatory_programs(id)`, tenant column `organization_id`.

- This is the canonical way to scope a child that has no tenant column. The
  line goes in the class that already holds complaints, `mdr_events` and
  `vigilance_events`: children keyed by a text program id with no foreign key.
  The file's 2026-09-08 amendment already compares such keys as text.
- Nothing is removed from the file.
- The file is applied both by `install-fresh`'s child-scope step and by the C2C
  set on every deploy.
- The same predicate as its siblings applies:
  - enforcement off (owner connections) passes;
  - `app_super_admin` passes;
  - otherwise the program's `organization_id` must equal the scope's tenant.
- **A task naming no program is visible to no tenant scope, and cannot be
  written by one.** It fails closed. The platform scope still sees it.

No application code changed, because both routes already work within the
program's organization.

**The child-scope contract (`tests/db/child-table-parent-scoped-rls.dbtest.ts`)
now covers the new line.**

- `drafting_tasks` is on its list of every table the migration names.
- The scratch schema has the table.
- A per-tenant isolation case follows the `complaints` pattern.
- The three cases that each inserted a program the same way now share one
  `seedProgram` helper. That removes the duplication and keeps the file under
  the 500-line limit (499), so the ESLint warning count does not grow.

## The contract

`tests/db/drafting-tasks-tenant-scope.dbtest.ts` runs on the two-tenant
fixture, through the application pool. The route cases use the production
drafting router behind `server/auth.ts` `authMiddleware`.

| # | Case | Before | After |
| - | --- | --- | --- |
| 1 | A starts a task for its own program through the route and reads it back (positive control) | pass | pass |
| 2 | The route refuses B's task and B's program to A's token | pass | pass |
| 3 | A's scope reads none of B's drafts (by id, by program, by content) | **fail**: B's draft returned | pass |
| 4 | A's scope cannot rewrite or delete B's draft | **fail**: 1 / 1 | pass |
| 5 | A's scope cannot file a task under B's program, or under no program | **fail**: 1 / 1 | pass |
| 6 | A's scope reads and writes its own program's tasks | pass | pass |
| 7 | The platform scope reads every organization's tasks | pass | pass |

**Mutation, in the state trunk was in.** `red/M1-spec-line-removed.txt` removes
the spec line from the file, and removes the policy, FORCE and RLS from the
database.

- Five cases fail across both contracts: the child-scope contract's "every
  table named … policied" and its `drafting_tasks` isolation case, and cases
  3–5 above.
- `deploy-migrate` then restores the policy.
- An earlier attempt only removed the spec line and left the live policy in
  place. It stayed green, because the migration never drops a policy it did not
  create. That is how I learned the contract reads the real `public` schema,
  and why the recorded mutation removes both.

| File | Shows |
| --- | --- |
| `green/after.txt` | Both contracts, **20/20** |
| `green/from-blank.txt` | `c2c_d3w`, provisioned from blank after the change. `drafting_tasks`, `users` and `platform_role_grants` are policied after one deploy. The coverage check after that first deploy shows one row, `regulatory_harmonization.export_job_audit_log`. That is the pre-existing first-deploy item handed on to D3 on 2026-09-24 (work-orders, "Handed on by the install child-scope change", item 1), and it is claimed by another session. A second deploy clears it, leaving 0 rows. All four contracts pass 37/37 there. |
| `green/full-db-tier-summary.txt` | The whole `tests/db` tier: 768/781. The 13 failures are the same pre-existing ones, by name, recorded in `../2026-09-28-users-rls/` (identical with `users` RLS off). |
| `posture.txt` | RLS and FORCE on, the policy as stored, and `app_service` NOSUPERUSER NOBYPASSRLS. |

**Gates and other suites:**

- `ci:migration-set-order` OK.
- `ci:migration-drop-safety` OK.
- `ci:rls-allowlist-sync` OK.
- `ci:tenant-isolation:no-regression` OK (8, the same as the baseline).
- `rls-coverage-check.sql` returns 0 rows.
- The mocked `drafting-task-object-authz` and `regulatory-root-gate` suites pass
  16/16.

## The other children of `public.users`, measured, not policied

- **`user_presence`** can hold IP address, user agent and current document, but
  nothing in `server/`, `client/src/` or `scripts/` reads or writes it. Only
  `shared/schema.ts` declares it, and it has 0 rows. Nothing is exposed today.
  Its first writer should bring a policy; this is recorded on the board.
- **`notification_preferences`** is read and written only by `/api/users`
  (`server/routes/users.ts`). That is a pre-auth mount, keyed by the verified
  token's user id. It holds booleans, a digest cadence, quiet hours and a time
  zone. It is left as recorded, low-stakes user-keyed data.
