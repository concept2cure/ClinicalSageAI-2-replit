# Demo recovery, 2026-10-31: the rail works, Submission Center is back, and the demo data builds

The founder's client demo on 2026-10-31 reported five failures:
- nothing on the left rail worked;
- a new project could not be created;
- there were no demo projects;
- Tasks did not work;
- Submission Center was not there.

Each was reproduced here on a running stack: today's code, a provisioned Postgres 16 brought to today's migration set,
the app started as the show-and-tell runtime starts it (`node --import tsx server/index.ts`, `RLS_ENFORCE=on`), and
driven in Chromium through Playwright.

## What was wrong, and what changed

| Reported | Cause found | Change |
|---|---|---|
| Nothing on the rail worked | With no project open, every project-scoped rail entry (Tasks, Communication, Vault, CMC, Quality) was sent to Projects without a word (`destinationFor` → `OPEN_PROGRAM_SURFACE`). Tasks and Quality were marked project-scoped although the task board is cross-project and QMS is organisation-wide. | Tasks and Quality are `global` in `shared/navigation/index.ts`. A project screen chosen with no project open now reopens the last project the signed-in account opened (`reopenLastProject`, `shellProject.ts`, kept per account, never another person's), and every screen still admits the project on the server. With no project ever opened, Projects says which screen needs one. |
| Screens failed on first use | The database pool was 20 connections in development, with a 5 s wait. A cold server's first page ran it dry while tsx compiled route modules, and project admission answered 503 "access could not be verified". | The pool is 40 everywhere, and a request waits up to 20 s in development and 10 s in production. `DB_POOL_MAX` and `DB_CONNECTION_TIMEOUT_MS` override both (`server/db/runtime.ts`). |
| Submission Center was not there | It was taken off the rail on 2026-10-25 (P-47, d973880052), reachable only from a project's Submit step and ⌘K. | It is back on the rail, after Vault (`RAIL_CORE`). `shellNav.test.tsx` is updated to match. |
| No demo projects | The demo seed (`npm run demo:seed`) failed partway: the server grew stricter in eight places and the seed did not follow. | The seed now runs to completion (exit 0, 77 steps). See the list below. |
| A new project could not be created | Not reproduced: on today's code the wizard creates an IND project and opens its home (`screens/new-project-created.png`). The founder's runtime may be on older code or an older database. | — |

The demo seed's eight drifts, in `scripts/demo/launch-demo`:
- **Review requests.** They name a reason and a review due date, under `route`.
- **Independent review.** A review is requested only when a second identity is configured. The server refuses the
  author as reviewer, so without one the step is recorded as not executed, as the seed already does for signatures.
- **Device program.** It names the predicate's trade name with its number.
- **Protocol document.** It names its program.
- **QMS documents.** They are created in the demo program, with a reason and no extra fields. Their text is written
  into the editing copy with a change reason (`fillQmsSections`).
- **Sending an SOP for review.** It needs a second person, the named approver.
- **Change transition.** It carries a reason.
- **eSTAR probe.** It accepts the server's improvement.

## Operator notes for the show-and-tell runtime

- **Name the app's database role at deploy.** Since P-72 (ae12195a56, 2026-10-30) the sign-in and invitation lookups
  are owned by `c2c_platform_scope`. The runtime role keeps EXECUTE only through the deploy's grant refresh, so run
  `npm run db:migrate:deploy` with `RUNTIME_DB_ROLE=<the app's role>` (or `APP_DATABASE_URL`). Without it, sign-in by
  email and `/api/tenant-users/invitations/mine` fail with "permission denied".
- **Seed the demo data.** On a dev-auth server, run:

  `npm run demo:seed -- --pack all --email <your login email> --base-url <the app URL>`

  This builds:
  - "[Demo · Biotech] C2C-101 … (IND)": Vault documents, authored documents with comments, protocol development, a
    submission and sequence, SOPs and change control;
  - "[Demo · MDX] NeuroPanel-Dx 510(k)": the same set for a device.

  Set `OQ_SIGNER_EMAIL` and `OQ_SIGNER_PASSWORD` to a second person to also run reviews, approvals and signatures.

## Proof

- **Screenshots.** `screens/`:
  - before: Tasks bounces to Projects;
  - after: Tasks opens without a project, Submission Center is on the rail inside the reopened project, the seeded
    projects are listed, and a new project is created.
- **Rail run.** Every rail entry, driven on a cold server: Tasks and Quality open without a project. Communication,
  Vault, Submission Center and CMC open in the reopened project, with no failed request.
- **Seed run.** `demo-seed-run.txt`: the run, exit 0.
- **Tests.** `railOpensWithoutProject.test.ts` and `shellNav.test.tsx` pass (34 tests).
- **Mutation.** `mutation-tasks-project-scoped.txt`: with Tasks project-scoped again, the new test fails.
- **Not this change's.** `railLicenseGating` and `cmdkLicenseGating` time out on HEAD without this change.
