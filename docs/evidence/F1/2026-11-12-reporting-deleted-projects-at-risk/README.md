# F1 · A deleted project is not one of "the projects you can open" (2026-11-12)

**Package:** F1. **Session:** the reporting session (`session_011HLkYC…`, lane L11). **Routed by** the coordinating
session at 23:15 UTC, from the CSR lane's critic: the same class as S12 sweep finding 89.

## Re-checked in the running app first (`before-running-app.txt`, `probe.mjs`)

A project was created, made overdue and scanned, so the deadline analyzer named it. It was then deleted in Projects.
"Which projects are at risk this week" is headed "for the projects you can open", and still listed
"Project "DELETE-PROBE overdue project" is 3 days overdue".

Deleting a project sets `regulatory_programs.deleted_at` and leaves its anchor `projects` row as it was
(`server/routes/c2c/projects.ts` `closeOut`). The read behind that heading took every `projects` row the sharing
policy admits, with no state.

## What already exists (RULE 3)

| Piece | Path | What it does | What it did not |
|---|---|---|---|
| The list | `server/services/report-os/project-access.ts` `getAccessibleReportProjectIds` | The projects the sharing policy admits a person to. About twenty readers | Knew nothing of a deleted project |
| The at-risk read | `server/routes/sentinel-routes.ts` `readableProjectIds` | Shows or changes a finding only when every project it names is in the list (P-122, 2026-11-10) | Asked for the whole list |
| Saved-report access | the same file, `canAccessReportScope`, `canAccessReportProject` | Admits a saved run or pack by its recorded projects, "including archived records retained for audit" | — |
| What blocks a delete | `server/routes/c2c/projects.ts` `PROJECT_HOLD_READS` | Transmitted, frozen or dispatched, filed and sealed records | A signed report run is not among them |
| The same rule elsewhere | `portfolio/fetch.ts` (finding 89), `device-portfolio.ts` | Each leaves out a deleted project in its own read | — |

## What changed, and what did not

The list has two meanings, and only one changes.

- **`{ openable: true }`: the projects a person can open now.** A project deleted in Projects is left out, with every
  work project under it, and a row marked deleted itself. An archived project can still be opened, so it stays. The
  at-risk read and the finding update now ask for this.
- **The default: the projects whose saved reports a person may read. Unchanged, to the statement.** A signed report
  run is a record, and deleting a project does not check for one. Narrowing the default would take a deleted
  project's signed runs out of Run history. The default read's SQL is byte for byte what it was; a contract suite
  whose database has no `regulatory_programs` table showed why that matters.

## Red first, then green

| File | What it shows |
|---|---|
| `red.txt` | Before: the three behaviour cases fail (the list, the route's request, the refused update). The five that pin what must not change pass before and after |
| `green.txt` | After: the two new files, and every server test that touches the list or the at-risk reads |

## In the running app, after (`after-running-app.txt`, `after/`)

- `GET /api/sentinel/findings`: 7 findings, none naming the deleted project (8 and 1 before).
- Reporting's overview and Run history, which use the default list, answer as before.
- Projects, "Which projects are at risk this week", opened at 1440 and 390 (`screen.cjs`, `after/screen-probes.json`):
  7 open findings "for the projects you can open", none for the deleted project, no page error.

## Found, not fixed here

- **For the founder or the Projects lane:** a project that holds a signed (finalized) report run can be deleted,
  because `PROJECT_HOLD_READS` does not look for one. Its runs stay readable today only because the default list
  keeps deleted projects. Whether such a project should be archived instead, like one with sealed documents, is a
  decision; the file is not this lane's.
- The other readers of the default list (AnA's source scope, the data room, tasking, search) still receive a deleted
  project's id. Each is another lane's read; `{ openable: true }` is there for them to ask for.
- `server/services/sentinel/sentinel.ts` still scans a deleted project's rows (its deadline analyzer leaves out only
  completed and archived). The coordinating session has routed that file to the CSR lane.

## 2026-11-14: the read restructured for the SQL interpolation gate

The first push was refused by `ci:sql-interpolation`: the openable read spliced two fixed SQL fragments into the
admitted-projects statement, and the gate counts any value placed in SQL text. The deleted projects are now read by
their own fixed statement (`CLOSED_PROJECTS_SQL`, bind parameters only) and taken out of the admitted list in code.
The admitted-projects statement and its function are byte for byte what they were before this change. The same
tests pass (the two new files, the 93-case contract suite, Reporting's suites: 97 files, 1,267), and the running
app answers the same: no finding for the deleted project (`after-running-app.txt`).
