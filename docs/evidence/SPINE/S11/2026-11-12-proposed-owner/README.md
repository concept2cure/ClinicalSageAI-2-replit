# The Assign form proposes the people who hold a task's job role (2026-11-12)

P-119's catalog reached from the Plan step. Addressed to S11 in COORDINATION by Client administration
(`01T2woo…`): "the catalog maps the plan's 26 task role keys to job roles (`jobRoleForPlanTaskRole`), for proposing
a task's owner". Nothing called it.

## What already exists

| Existing | What it does | What it did not |
|---|---|---|
| `shared/regulatory/client-type-job-roles.ts` (`jobRoleForPlanTaskRole`, `matchStandardJobRole`, `PLAN_TASK_ROLE_HOLDERS_ELSEWHERE`) | Maps each work-breakdown role key to a standard job role; matches an organisation's role name to a standard role, exactly | No caller in the product |
| `GET /api/mdx/qms/job-roles` (`server/routes/mdx-qms-training.ts`, `readQmsJobRoles`, P-49) | The organisation's job roles and who holds each, with `active` | Read only by Quality |
| `PlanAssign.tsx` `AssignAction` / `assignForm`; `PyramidProject.tsx` task sheet | Assigns a work-breakdown task to any member, due on the schedule's date | Said nothing of who the task is for |
| The task's `role` (engine pyramids, `fixtures/pyramid-data.ts`) | Shown on the task sheet | Not used when choosing a person |

No route, service, table or screen is added. Searches: `jobRoleForPlanTaskRole`, `job-roles`, `proposed owner`,
`suggest.*assignee` across `client/`, `server/`, `shared/`; `git log --all --diff-filter=D` on the same names found
nothing deleted.

## What changed

`PlanAssign.tsx`: when Assign opens for a work-breakdown task, the Person field says which job role the work
breakdown gives the task to, and the active members who hold that job role are listed first, marked with the role's
name. The person still chooses; no one is preselected. It is a lookup, never a guess (RULE 2):

- an organisation's role counts only when its name is a standard role's name (the catalog's exact match);
- a holder who has left is not proposed;
- no holder: "No one in your organisation holds that job role yet."; the list is unchanged;
- the job roles cannot be read: "Who holds that job role could not be read."; the list is unchanged and assigning
  still works;
- a deliverable, or a role the catalog does not know: nothing is said.

The changing sentence is in the form's live region (`descStatus`), so a screen reader hears it when the read lands.
`PyramidProject.tsx` passes the task's role (one prop).

## Proof

- `client/src/concept2cure/v2/__tests__/projectProgramPlan.test.tsx`, "the Assign form proposes the people who hold
  the task's job role" (4 tests). Red first: `red.txt` (a departed holder and a near-named role counted).
- Running app, as `app_service` with `RLS_ENFORCE=on` and the launch gate on, at 1440 and 390: `walk.cjs`,
  `walk.json`, `screenshots/`. The job role and its holder were made through the product's own routes (with the
  reason they require). "Define product profile" lists the holder first; "Submit IND" (the regulatory operations
  lead) says no one holds the role. No 5xx. `ci:launch-scope-api` passes (the read is a launch screen's prefix).

## Open

- Job roles are adopted today in Quality; P-119's Administration screen is Client administration's. Until an
  organisation has roles under the standard names, the form says no one holds the role.
- The catalog's client-type fallback (`jobRoleForPlanTaskRole(key, organisation)`) is not used: the client has no
  read of the organisation's client type here, so every role the key may fall to is accepted instead.
