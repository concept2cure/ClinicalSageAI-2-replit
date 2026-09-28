# P1-8 — object-level authorization: drafting tasks and stability results (IAM-11)

**Row moved:** D6 (security posture); the finding is D3-shaped (tenant isolation) and D5-shaped
(audit rows), and is closed here as part of the audit's P1 tranche.
**Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-11 (Medium).
**Plan item:** `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` P1-8.
**Commit:** `83849bfd` (2026-09-26); the gates wired in the same push: `1a7c8e6c`.

## What was wrong (verified at HEAD before the change)

- `POST /api/v1/drafting/start_task` (`server/routes/misc-inline-routes.ts`) recorded a task
  against any `project_id` the caller named, with no read of the project at all, and
  `GET /api/v1/drafting/task_status/:task_id` returned any task by id. `drafting_tasks` has no
  organisation column. When the table was unavailable, both fell back to a process-wide
  in-memory map (`global.draftingTasks`): a fabricated success on write, and on read a map any
  authenticated caller in the process could read by id.
- `PATCH /api/stability/results/:resultId` and `DELETE /api/stability/results/:resultId`
  (`server/src/routes/stability.router.ts`) wrote by `result_id` alone, answered `{ ok: true }`
  whether or not a row existed, and wrote no audit record, while `result_add` and
  `result_review` beside them do. Tenant row security was the only line, and it answers with
  zero rows, not with a refusal.
- `server/routes/templates.ts` carried a second, unmounted copy of the two drafting handlers
  (and of the template catalog reads), imported by nothing and listed in
  `scripts/ci/unreferenced-modules-baseline.json`.

## What changed

- Drafting: ownership is the program's. `project_id` names a `regulatory_programs` row and that
  row carries `organization_id`; a task is written only after the program is read with the
  session's organisation as a predicate (404 otherwise), and read only through the same join.
  No session organisation → 401. A write or read that fails is 503; the in-memory fallback is
  gone. The drizzle client the two handlers used is gone with it; the handlers issue SQL on the
  pool the module is given, like the rest of the file.
- Stability: PATCH and DELETE run in one tenant-scoped transaction: the tenant's own row is
  read `FOR UPDATE` with `stab_results.tenant_id` as a predicate (404 when there is none), the
  change or deletion is applied with the same predicate, and a `stab_audit` row
  (`result_update` with the previous values and the fields changed; `result_delete` with the
  deleted values) is written on the same client before COMMIT. No verified actor → 401 before
  a connection is taken.
- `server/routes/templates.ts` deleted. Reachable replacements, by path, all in
  `server/routes/misc-inline-routes.ts` mounted at `server/bootstrap/register-inline-routes.ts`:
  `GET /api/templates`, `GET /api/ectd/templates`, `GET /api/ectd/templates/:id`,
  `POST /api/v1/drafting/start_task`, `GET /api/v1/drafting/task_status/:task_id`. The one
  route with no twin, `PATCH /ectd/templates/:id/default`, was never mounted and so never a
  user-facing capability; adding it is a product decision, not a restoration. History search
  (`git log --all --diff-filter=D -- 'server/routes/*templates*' 'server/routes/*drafting*'`)
  finds no earlier deletion of either module.

## Evidence

- `red/object-authz-before-fix.txt` — the two new suites against the routes before the change:
  14 of 14 cases fail (a foreign program accepted with 202; a foreign task read with 200; a
  failed write answered 202 from memory; a foreign result updated and deleted with 200; no
  audit rows; no actor check).
- `green/object-authz-after-fix.txt` — the same suites after the change.
- `green/gates.txt` — the gates that react (`check:security-patterns`,
  `ci:tenant-isolation:no-regression`, `ci:requestdb-coverage`, `ci:unreferenced-modules`,
  `ci:server-error-leaks`).

## Re-run

```
npx vitest run server/routes/__tests__/drafting-task-object-authz.test.ts \
  server/src/routes/__tests__/stability-results-object-authz.test.ts
```

## Left open

- A real-database run of the cross-tenant cases (the plan's acceptance names a dbtest) is
  not in this session's container; the pool doubles pin the statements and predicates, and
  the tenant-isolation contract suite runs the shape on the two-tenant fixture in CI.
- `drafting_tasks` still has no organisation column. Adding one means amending the creating
  migration (`migrations/0008_ga_hardening.sql`) in place per CLAUDE.md Rule 1, in the
  migrations window; the program join is the ownership rule either way.
