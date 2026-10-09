# WO — 2026-09-21 — Protocol development: the read model and the write routes

Worker WO was terminated by a spend limit partway through. It had finished
the SERVER half and had not started the surface. The control tower verified
what was on the tree, updated the test fixture WO left behind, cleared the
warnings it added, and files this record. **The client work is owed** — see
"What is still owed" below, which is the honest state of this row.

## What landed

`protocol-dev` joined the Authoring launch app earlier the same day (WI),
and the surface then rendered whatever `GET /api/protocol-dev` returned.
WI's register-by-register audit found most registers read-only and several
computed nothing: the schedule of assessments always reported `issues: []`
(not a verdict, a hard-coded empty list), the budget verdict was omitted,
consent was unsupported, and the sponsor and principal investigator were
not stored at all.

The read model now returns what the surface needs to render the real state:

- **Schedule of assessments** — the SoA engine's own matrix and findings
  (`buildSoaMatrix` / `validateSoa`, the same engine `/api/protocol-soa`
  serves), so the grid and its issues are one verdict. Cells orphaned by a
  deleted visit or assessment are filtered before the matrix is built.
- **Budget** — `computeProtocolBudget`'s summary, the same one
  `/api/protocol-budget/documents/:id/summary` returns. The raw inputs are
  carried separately; every derived figure comes from the engine.
- **Consent** — the latest linked consent form's elements, replacing the
  hard-coded empty list.
- **Study team** — `protocol_team_members`, with role and responsibilities.
- **Sponsor and principal investigator** — new nullable columns
  (`migrations/20260921_protocol_documents_sponsor_pi.sql`, ADD COLUMN IF
  NOT EXISTS, guarded on `to_regclass`, no DROP). The cover page reads the
  column, falling back to the team member holding that role.
- **Risk owner**, **review disposition** and **due date** are carried.

`server/routes/protocol-development.ts` gained the write routes for those
registers (+142 lines).

## Fixed by the control tower before committing

The assembler's PGlite integration fixture still declared the old table
shapes, so all three of its cases failed with `column "sponsor" does not
exist`. The fixture now declares the columns and the three tables the
assembler reads (`protocol_team_members`, `consent_forms`,
`consent_form_elements`). Five warnings WO introduced were cleared by
extraction, not suppression: `runSoaEngine`, `mapSoa`, `mapBudget`,
`mapAmendments`, `mapDeviations`, `mapReviews`, `coverPagePi` and
`firstOpenSectionId` are now named functions, and the file is back to its
single pre-existing warning.

## Verification re-run by the control tower

| Check | Result |
|---|---|
| protocol-development + protocol route suites | 5 files, 31 passed |
| whole-tree `tsc --noEmit` | 0 errors |
| eslint warning ratchet | no file changed its warning count |
| `ci:migration-set-order` / `drop-safety` / `db:sync-manifest:check` | pass |

## What is still owed

The surface itself. `ProtocolDev.tsx` was never opened by this worker, so
on screen the registers are still read-only: there is no section editor, no
add-visit or add-assessment control, no residual-risk form, no budget line
entry, no reviewer entry. The data and the routes are now there for all of
them. The Consent tab must also be decided: the read model can fill it now,
so either the tab is wired to it or it is removed — it must not keep
promising what it does not show.
