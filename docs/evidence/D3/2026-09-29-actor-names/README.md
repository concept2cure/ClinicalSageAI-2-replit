# D3: the audit trail lost the name of anyone who had left the organization

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-29. This is the hand-on "actor names outside the
organization render null", recorded with `../2026-09-28-users-rls/`.
**Database:** `c2c_d3u`, PostgreSQL 16, provisioned from empty. The runtime
connects as `app_service`, which is not a superuser and has no BYPASSRLS, with
`RLS_ENFORCE=on`.

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The defect

`audit_logs` keeps the actor's id and no name. `audit_events` stores
`user_name` when each row is written, but `audit_logs` does not. The audit-trail
ledger (`server/routes/audit-trail-ledger.routes.ts`) looked the name up by
joining `users`. Since `public.users` took row-level security on 2026-09-28, a
tenant scope sees only its current members, so that join finds nothing for
anyone who has left.

The test wrote an entry through the production audit writer
(`auditService.logAction`) while the person was a member, removed their
membership, and read the entry back through the production ledger reader
(`readRecordAuditHistory`) in the organization's own scope. The entry read
**`user 951`**, not the person's name (`red/before.txt`).

The id stayed, so the entry was never misattributed. But an audit trail that
shows a number where a person's name belongs is harder to review (Part 11
§11.10(e): an audit trail should record who acted).

## The decision

There were two options on the board: a name stored on each audit row, or a
limited name lookup. I chose the lookup.

- `audit_logs` is hash-chained and append-only, and it belongs to the D5
  lane, so adding a column to it is a larger change.
- A lookup also fixes every entry already written, including those from
  before this change.

**`migrations/20260929_actor_names.sql`** adds `public.actor_name(user_id)`:

- It returns **name and email only**, never another column.
- It answers only for a user who is **a member of the calling scope's
  organization**, or **an actor in its own audit trail**
  (`audit_logs.tenant_id` = that organization).
- As with `users` itself, the tenant-less scopes see everyone, and so do
  connections with enforcement off.
- For anyone else it returns no row.

So an organization learns the names of people who worked in it and nothing
about anyone else. Password hashes, MFA secrets and tokens stay behind the
`users` policy.

How it is built:

- It is SECURITY DEFINER, and its body runs with the platform role. EXECUTE is
  revoked from PUBLIC and granted to `app_service`.
- `audit_logs_tenant_actor_idx (tenant_id, actor_id)` serves the "acted here"
  test (see the index-only plan in `posture.txt`). It is created only when it
  is missing, so a replay takes no lock on `audit_logs`. The one build, on the
  first deploy that carries this file, holds `audit_logs`' SHARE lock for the
  length of the build.
- If a table it needs is absent, the file is skipped with a NOTICE.
- It is in `C2C_MIGRATION_FILES` after the invitations file.

**The ledger:** both queries (the tenant ledger and one record's history) now
use `LEFT JOIN LATERAL public.actor_name(actor_id)` instead of joining `users`.
Their two PGlite suites create the real function from the real migration file.

## The contract

`tests/db/actor-names.dbtest.ts`:

| # | Case | Before | After |
| - | --- | --- | --- |
| 1 | After the person leaves, the organization's audit trail names them | **fail**: `user 951` | pass |
| 2 | The lookup answers nothing about an account that never belonged to or acted in the organization | fail (no function) | pass |
| 3 | It returns name and email only | fail (no function) | pass |
| 4 | `users` itself still refuses the leaver's row to the organization | pass | pass |

**Each safeguard was made to fail:**

| File | Mutation | Fails |
| --- | --- | --- |
| `red/M1-no-past-actor-arm.txt` | lookup without the "acted in this organization" test | case 1 (`user 961`) and case 3 |
| `red/M2-no-scope-restriction.txt` | lookup with no restriction | case 2: another tenant's user resolved |

**Results:**

- `green/after.txt`: this contract plus `users-rls`, 15/15.
- `green/ledger-suites.txt`: the ledger's route test, the vault document
  history route and PGlite tests, and the client's signed-row test, 24/24.

## The display conversions

The 46 other joins on `users` were triaged into actor-of-record displays,
which convert, and membership listings or authorization lookups, which stay
(an authorization check must not start answering for people who left).
Per-row SQL now reads `LEFT JOIN LATERAL public.actor_name(<id>) u ON TRUE`;
code that collects ids first uses `resolveActorNames` / `actorLabel`
(`server/services/tenant/actor-names.ts`). An actor that cannot be named
renders as `user <id>`, never "System", "Unknown" or "Unassigned", which would
attribute the act to someone else.

Where the join was INNER the record itself disappeared, not only the name:

| Surface | Before (red) | Case |
| --- | --- | --- |
| Section comments, workload, history, list | `red/displays-before.txt`: the leaver's comment and assigned section vanished; history and assignee read `null` | `actor-displays` |
| Program lead and activity | `red/programs-before.txt`: lead `null`, editor shown as "System" | `actor-displays` |
| Project activity feed, MDx audit list | `red/feeds-before.txt`: feed 500 (it selected `u.full_name`); audit list `User <id>` | `actor-displays` |
| MDx admin audit band, c2c program list | `red/admin-portfolio-before.txt`: "Unknown account", lead "—" | `actor-displays` |
| Sentinel over-allocation, CRO lead, project home | `red/vanishing-before.txt`: finding missing, next assignee promoted to lead | `actor-vanishing` |
| RBM board | `red/rbm-before.txt`: approver `null` | `actor-vanishing` |
| Task analytics | `red/task-analytics-before.txt`: leaver's work gone from productivity | `actor-vanishing` |
| Artifact review record (`c2c/artifacts.ts`) | `red/collaborators-reviewers-history-before.txt`: the leaver's assignment **and approval** gone from the record; status read "Unknown" for both reviewers | `actor-vanishing` |
| Project collaborators (`concept2cure.ts`) | same file: the leaver on the ownership team had no name | `actor-displays` |
| Section revision history (`authoring.router.ts`) | same file: the leaver's revision unnamed | `actor-displays` |
| Dossier section versions (`c2c/documents.ts`) | `red/dossier-journey-before.txt`: author `null` | `actor-displays` |
| Document journey (`doc-journey-view-assembler.ts`) | same file: creator and reviser unnamed | `actor-displays` |

Also converted, display-only and covered by their route suites:
`audit-trail-ledger.routes.ts`, `project-hierarchy.ts`, `project-rollup-service.ts`,
`mdx-audit.ts`, `c2c/project-vault.ts`, `submission-ops.ts`,
`ApprovalOrchestrator.ts`, `ana-ri/command-executor.ts`,
`mdx-submission-gateway.ts`. The PGlite suites and golden journeys that reach
these paths now apply the real migration rather than a stub.

`green/batch2-after.txt`: `actor-displays`, `actor-vanishing`, `actor-names`
and `users-rls`, 30/30, as `app_service` with RLS enforcing.

## The last three sites (2026-10-04)

`concept2cure.ts`, `c2c/artifacts.ts` and `authoring.router.ts` were held back
on 2026-09-29 because other lanes had changed them within 24 hours. Converted
once those windows had closed, after merging trunk; red was re-recorded
against a database provisioned at that head (`c2c_d3x`), with exactly the four
new cases failing and the other 15 passing.

- The review record had dropped a former member's assignment, and with it
  their approval decision: a review record that loses an approval is not an
  attribution defect but a Part 11 record defect.
- `doc_revisions.created_by` is text. The name is looked up through a guarded
  cast (`CASE WHEN created_by ~ '^[0-9]{1,9}$' …`), so a non-numeric author
  names nobody instead of failing. `red/M3-unguarded-cast.txt`: with a bare
  `::int` the history answers 500.
- A sweep of every remaining join on `users` at that head found two more
  actor-of-record displays that arrived after the triage or were missed by it:
  `c2c/documents.ts` (dossier section versions) and
  `doc-journey-view-assembler.ts` (document creator and revision authors).
  Both converted, each with its red case (`red/dossier-journey-before.txt`).
- `green/batch3-after.txt`: `actor-displays`, `actor-vanishing`,
  `actor-names` and `users-rls`, 36/36, as `app_service` with RLS enforcing.
  The mocked collaborator test, the document-journey PGlite suite and the IND
  authoring journey now go through the resolver and the real migration.

What stays on `users`, by the same sweep: membership listings
(`access-review.ts`, `mdx-admin.ts` members, the `c2c/artifacts.ts` team
picker, `business-center.ts`), authorization look-ups (`mcp/auth/store.ts`,
`taskManagement.routes.ts`), platform-administration reads that run in the
system scope and see every account (`master-admin.ts`, `licensing-history.ts`,
`access-management.ts`), and `mdx-engineering.ts`'s risk owner, which by its
own written rule is shown only while the assignee is a member. None of these
should answer for someone who has left.
