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
| 6 | Found walking a finalize that succeeds: **the signature's meaning was a stored token, and the PDF's time was raw.** The seal line said "Signed by JM Smith as authorship", the seal section "Meaning authorship", and the PDF "Final. Signed by JM Smith as authorship, 2026-11-09T18:53:45.935Z (UTC)." (`found/seal-line-as-authorship-1440.png`, `found/pdf-signed-line-before.txt`). | `39d5f74d32` (D7) and `0e5706a308` (F1). The meaning now comes from the signing dialog's own list, and the time from the canonical manifestation formatter. | The PDF suites failed 4 of 20 on the new words; the seal-section case failed too |
| 7 | Found walking a finalize that succeeds: **a reopened sealed run showed no seal line.** Its signature appeared only inside the closed "Seal, signature and sources" section, while right after signing the line sat under the report. | `e8e3c63093` (D7): reopening reads the seal back and shows the same line when the seal verifies. | 2 cases |
| 8 | Found while registering a legal original: **opening your own Account panel reset Reporting** and dropped the open report, saying "Reporting was reset for the current account … In the original account, check Run history" (`found/account-panel-reset-notice-1440.png`, `scripts/account-panel-reset.cjs`). The account had not changed. | `52f0b562b9` (D7): the notice says which reload happened, either another reader or the same account read again. The reload itself (a role change must withdraw private results) belongs to the shared session hook and `authService.refreshUser`. It is routed to their holders, not changed here. | 2 of 3 cases |

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

## A finalize that succeeds (`finalize-ok/`)

Each of the 20 reports the Catalog runs here was run once, with its `finalEligibility` read back. 19 are held, each
saying why:
- critical or outstanding blockers;
- a confidence the type requires and none was computed;
- a gaps section the type requires.

Only the **Research Administration Scorecard** can be finalized.

Walked at `0e5706a308`, and again at `e8e3c63093`, with `scripts/finalize-ok.cjs` and `scripts/reopen-seal.cjs`, as the demo user with
the demo password:
- **Before signing**, the report offers "Export PDF" and "Finalize…".
- **The dialog** offers the meanings Authorship, Approval and Responsibility, and takes the reason and the password.
- **After "Sign and commit"**, it says "Signature applied", with the signer, meaning, reason, time and chain hash, and a
  Done button.
- **The seal line:** "Final. Signed by JM Smith, meaning Authorship, 2026-11-09 18:58:15 UTC. Sealed sha256 f5c8f7187b55…
  over 100 provenance atoms". Finalize is no longer offered.
- **The PDF** (run 81) reads "Final. Signed by JM Smith, meaning Authorship, 2026-11-09 18:58:15 UTC." and "Seal
  verification at export: intact." (`finalize-ok/pdf-signed-line-after.txt`).
- **Run history** lists the run as Final. Reopened, its "Seal, signature and sources" section says "Seal verified":
  - the sealed document hashes to the seal the audit chain recorded;
  - the stored seal agrees field by field;
  - the signature signed that seal.
  It names the signer, time, meaning and reason. No audit HMAC key is configured here, and the section says so.
- No script errors, and no 4xx or 5xx.

**Fixed after the first finalize walk:** a reopened sealed run showed its signature only inside the closed seal
section, while right after signing the line sat under the report. Since `e8e3c63093` (D7), reopening reads the seal
back and shows the same line when the seal verifies, and shows no line when it does not. Re-walked at `e8e3c63093` on
run 82: the reopened line is identical to the one shown at signing (`finalize-ok/finalize-ok-reopened-1440.png`,
`finalize-ok-probes.json`).

## The pack ZIP with a legal original (`legal-zip/`)

Set-up, through the product:
- **Upload:** a one-page letter of authorization (SHA-256 `7035e188…`) into C2C-101's Vault, through `POST
  /api/vault/ingest` (`scripts/legal-upload.mjs`). The Vault records the same hash.
- **Register:** through Account → Company documents → "Register a legal document from Vault"
  (`scripts/legal-register.cjs`, `legal-zip/register-form-1440.png`). "Search your accessible Vaults" found the letter,
  and "Select document" filled the project and version for the person. The library answered "Legal document library
  updated. Source files and their approval records are unchanged."

**The chooser** (`scripts/legal-zip.cjs`, `legal-zip/zip-chooser-disabled-1440.png`):
- Bundles → "Re-walk pack" → "Choose legal companions for ZIP" lists "Letter of Authorization (US agent) · v1.0 · en ·
  review needed before filing — not reviewed".
- Its checkbox is disabled. A legal original goes with a filing only once its Vault version has reached an approved
  lifecycle stage (`server/services/vault/vault-lifecycle.ts`: "not reviewed" until it has a stage).
- That is the intended fail-closed behaviour, and the chooser says why in words.

**Not walked:** approving the letter through Vault's signed review, which likely needs a second reviewer, and so
downloading a ZIP with it. The export with a legal original is covered by `report-os-report-pack-export.test.ts`.

**Environment note:** this local database (installed before pgvector) has no `project_memory_entries`. So Company
documents' legacy-adoption read answers 500 here and its banner says "Company documents could not be read or saved". A
blank install has the table, and registration worked regardless. Routed to the coordinating session.

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

- **A schedule firing.** The sweep runs about every ten minutes, and the walk did not wait for it.
- **Deploying the 0014 fix.** It is held, unpushed, until the coordinating session lifts the 2026-11-09 demo freeze.
  Its preflight fails the deploy, by design, on any group membership whose group and project disagree. Such a row on
  the founder's Codespace database would stop the Codespace's start.
- No model key is set, so nothing here exercises AnA.
