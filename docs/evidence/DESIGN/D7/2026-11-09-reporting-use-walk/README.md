# Reporting & analytics, used in the running app (2026-11-09)

**Packages:** D7, F1, L1. **Session:** the reporting session (`session_011HLkYC…`, lane L11).
**Why:** CLAUDE.md RULE 4 says a screen is not done until it is opened in the running app *and used*. The earlier
walks checked Reporting's layout (`../2026-11-02-reporting/`, `../2026-11-08-reporting-rewalk/`). The one report pack
was made through the API, and no walk had used the actions:
- run a report from the Catalog;
- export it;
- finalize it;
- find it in Run history;
- bundle it into a pack;
- schedule it.

## What was run

- **Before** (`found/`): a `git archive` copy of `d35a86e380` (the head at 17:50 UTC), on port 5100, with
  `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on` and dev sign-in.
  - The database was the local `clinicalsage`, migrated forward by the copy's `deploy-migrate` (runtime role `c2c`, not
    a superuser, no RLS bypass).
  - The user was `jm.smith@concept2cure.pro`, organisation 1, project C2C-101, in Chromium at 1440×900.
  - The steps were scripted one at a time.
- **After** (`fixed/`): the same set-up at `2135d3f9dd`, at 1440×900 and 390×844, using `scripts/rewalk.cjs`.

## Found, and fixed

| # | Found (at `d35a86e380`) | Fixed in | Red first |
|---|---|---|---|
| 1 | **Finalize was offered on a run the server would always refuse.** The person chose a meaning, wrote a reason and typed a password, then read "Not finalized — held below final: Cannot mark final: 23 critical blocker(s) present." (`found/finalize-refused-after-password-1440.png`). `GET /runs/:id/rendered` says it evaluates the gate "so the UI can show whether the report is eligible to be finalized". But it evaluates it for a partial request, and the critical-blocker rule fires only on a final one. | `b2d51f911c` (F1). The rendered read returns `finalEligibility` from the finalize route's own evaluation. Where it says no, Finalize's place says why. | `red/red-server.txt` (2 cases), `red/red-ui.txt` (1 case) |
| 2 | **Run history answered 500**, "column gp.organization_id does not exist" (`found/run-history-500-1440.png`, `found/run-history-500-server-log.txt`). `migrations/0014_report_os_foundation.sql` was amended in place on 2026-10-13 to add the column, and the history reads it. But 0014 was on no deploy path. A database installed before that date never got the column; CI's blank database has it, so CI stayed green. | `22256c6750` (L1): 0014 in `C2C_MIGRATION_FILES`, ahead of the seed and both tenant installers. `76c6f63c3a`: the deploy-path baseline shrinks by that line. | `red/red-migration.txt` ("on no deploy path") |
| 3 | **A schedule showed a type id and a database id**: "readiness.executive_digest", "project — 1", and the form's "Runs over project — 1" (`found/schedule-raw-ids-1440.png`). | `e710bc3d3f` (D7) | `red/red-schedules.txt` |
| 4 | **Twenty Catalog buttons were each named "Run"**, and every Run history row "Open" and every schedule "Pause". A screen reader could not tell them apart. A run with no recorded scope name read "project — 11". | `8a1feba597` (D7) | `red/red-names.txt` (3 cases) |
| 5 | Found on the re-walk at 390: **Run history and Schedules pushed the page sideways** by 138px and 133px. Their tables are about 510px wide. | `2135d3f9dd` (D7): each register scrolls in its own focusable, named region. | 2 cases, recorded in the commit |

## Proof

- **The deploy-path fix on real PostgreSQL** (`green/report-os-foundation-deploy.txt`):
  - `deploy-migrate` twice on the local database, which was installed before 2026-10-13. The column is added, NOT NULL,
    with both same-organisation keys, and Run history answers 200 with 23 runs.
  - A blank database through `scripts/db/provision-test-db.sh` (install-fresh, then deploy-migrate), then
    `deploy-migrate` again: exit 0 each time.
  - Both databases end the same: RLS on and forced, with the `tenant_isolation_policy`.
  - The PGlite test proves the replay over the earlier shape, and that a membership whose group and project disagree
    fails the deploy without rewriting anything.
- **Suites:** `green/reporting-suites.txt` covers 40 Reporting files, 415 tests, at `8a1feba597`. At `2135d3f9dd`, 39
  files pass, 405 tests, without `workflowDiscovery`, which these changes do not touch. The route suites pass:
  `report-os-run-engine` 31 of 31, and the finalize suite. `ci:migration-set-order`, `ci:migration-drop-safety` and
  `ci:migration-deploy-path` pass, as do the CSS gates.

## The re-walk at `2135d3f9dd` (`fixed/probes.json`)

At 1440 and 390:
- **The digest from the Catalog's "Run Executive Readiness Digest":** "Export PDF · Can't be finalized: 23 critical
  blocker(s) present." No Finalize is offered. Export saves a 49.8 kB PDF.
- **Run history** loads 26 runs, each Open named "Open the Executive Readiness Digest run of …", with no database key.
- **A pack:** at 1440, a run is picked in Run history, "Bundle 1 report" is clicked, the pack is named "Re-walk pack",
  and Create bundle lists it.
- **Schedules:** "Executive Readiness Digest · Every week on Monday at 08:00 UTC · C2C-101", with "Pause the Executive
  Readiness Digest schedule".
- Page overflow 0 at both widths, no script errors and no 4xx or 5xx.

## Pre-deploy step, production: required before `deploy-migrate` runs at `22256c6750` or later

**Owner:** whoever runs the production deploy (the D1 lane, with the founder's AWS and Neon access). This session has
no production access.

From `22256c6750`, every `deploy-migrate` runs `migrations/0014_report_os_foundation.sql`. Its preflight raises
`REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED` and stops the deploy, rewriting nothing, if any report group
membership has one of these:
- a missing group or project;
- a group or project with no organisation;
- a group and project in different organisations;
- an existing `organization_id` that disagrees with its group.

Before the deploy, run this read-only query on the production database, as the owner role:

```sql
SELECT member.id, member.program_group_id, member.project_id,
       parent.organization_id AS group_org, project.organization_id AS project_org
  FROM public.report_program_group_projects member
  LEFT JOIN public.report_program_groups parent ON parent.id = member.program_group_id
  LEFT JOIN public.projects project ON project.id = member.project_id
 WHERE parent.id IS NULL OR project.id IS NULL
    OR parent.organization_id IS NULL OR project.organization_id IS NULL
    OR parent.organization_id IS DISTINCT FROM project.organization_id
 ORDER BY member.id;
```

On a database that already has the column (installed on or after 2026-10-13), add this condition to the WHERE clause:
`OR (member.organization_id IS NOT NULL AND member.organization_id IS DISTINCT FROM parent.organization_id)`.

- **No rows:** deploy.
- **Any row:** do not deploy. The membership's tenancy must be reconciled first, by the people who own that data. The
  migration will not relabel or delete it, and neither should the deploy.

Checked so far, both with no rows:
- the local `clinicalsage` database (0 memberships);
- the coordinating session's earlier-installed demo database (0 memberships). There it ran the file in a rolled-back
  transaction, exit 0.

## Not covered here

- **A finalize that succeeds.** On this database every run of the digest is held by its 23 critical blockers, so no
  signature was taken. The ceremony and seal are covered by `insightsFinalizeSigned.test.tsx` and the route suites. The
  form was opened and filled with the demo password (`found/finalize-form-1440.png`), and the server refused it as
  above.
- **A schedule firing.** The sweep runs about every ten minutes, and the walk did not wait for it.
- **Deploying the 0014 fix.** It is held, unpushed, until the coordinating session lifts the 2026-11-09 demo freeze.
  Its preflight fails the deploy, by design, on any group membership whose group and project disagree. Such a row on
  the founder's Codespace database would stop the Codespace's start.
- No model key is set, so nothing here exercises AnA.
