# The biotech demo pack finds its own submission by program id, and creates C2C-201 in C2C-101's workspace

**Package:** DATA. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Asked by:** the coordinating session, 2026-11-09
("match by the project's own id, never by product name across projects, red-first in the pack tests"; and "check"
AMBIGUOUS_CLIENT_WORKSPACE for C2C-201). **Status: committed, not pushed** — the coordinating session decides the push
window (it reserved biotech-pack changes for after 23:00 UTC).

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The server's spine rule | `server/services/cmc/submission-spine.ts` `findProgramSubmission` (:107–115) | The submission anchored to this program first; otherwise an unanchored one matching the program's identity; never another program's | — |
| The pack's resolver | `scripts/demo/launch-demo/packs/biotech-submission.mjs` `ensureCanonicalSubmission` | Read the intake's spine submission when reported; otherwise matched by product name or title | Respect `programId`: it took **another program's** submission named "C2C-101" (local #29), and placing the IB leaf answered `409 CROSS_PROJECT` |
| The pack's program creation | `packs/biotech.mjs` `createProgram` | Created C2C-101 and C2C-201 through the canonical intake | Name a client workspace for C2C-201: once the Lumen pack has added its own workspace (id 3, "Lumen Bioscience (demo — not affiliated)"), creating C2C-201 is refused `409 AMBIGUOUS_CLIENT_WORKSPACE` and the rest of the pack does not run |

## Why it depends on order (the Lumen workspace)

`--pack all` runs biotech, then mdx, then lumen. On a fresh database biotech creates C2C-101 and C2C-201 while the
organization still has one client workspace, so intake picks it; lumen then adds "Lumen Bioscience (demo — not
affiliated)". From then on the organization has two workspaces and no default (a seed never marks one), and any run that
must **create** C2C-201 (it is missing, was renamed, or an earlier run stopped before it) is refused
`AMBIGUOUS_CLIENT_WORKSPACE`. A database where C2C-201 already exists by its title is unaffected, because the pack
looks it up before creating. This is the failure the coordinating session hit on its stack.

## What changed

- `biotech-submission.mjs`: `canonicalSubmissionFor(list, program)` mirrors the server rule. A submission anchored to
  another program is never chosen.
- `biotech.mjs`: `programIntakeBody(spec, explicitWorkspaceId)`. An explicit `--client-workspace-id` wins; otherwise
  C2C-201 is created in C2C-101's recorded workspace (the same fictional sponsor); with neither, intake decides as
  before. A found C2C-201 is not moved or re-checked against it.

## Red first

Both were extracted unchanged first, so the red is behavioural, then fixed:
- `biotech-submission-spine.test.mjs`: on the extracted current logic 3 of 4 fail (`red.log`); with the fix 4 of 4 pass.
- `biotech-program-workspace.test.mjs`: on the extracted current body 1 of 3 fails (`workspace-red.log`); with the fix
  3 of 3 pass.
- All pack tests: 139 of 139 pass (`tests.log`).

## In the running app (this container's local database, polluted by a test sweep: stray "C2C-101" submissions, a renamed C2C-201, two client workspaces)

- `biotech-run.log` (submission fix only): exit 1. The submission resolves to #1, C2C-101's own; then C2C-201's
  creation is refused `AMBIGUOUS_CLIENT_WORKSPACE`.
- `biotech-run2.log` (both fixes): exit 0. C2C-201 is created in workspace 2; its CMC and Module 3 compose; the audit
  chain is intact.
- `all-run1.log`, `all-run2.log`: `--pack all` twice in a row, **both exit 0** (18:52–18:55 UTC). The one record
  created on each run is C2C-201's Module 3 compile, which the pack runs every time by design.

## Follow-up (approved by the coordinating session for after 23:00 UTC): the demo change controls name their program

- **What already exists.** POST `/api/mdx/qms/changes` admits a body `programId` (`server/routes/mdx-qms-context.ts`
  `admitBodyProject`) and records it. The Quality evidence capture reads change controls as
  `program_id IS NULL OR = this program` (`server/services/qms/project-evidence-queries.ts:22,27`), so a change control
  created with none is organization-wide and appears in every project of the workspace.
- **What changed.** `biotech-qms.mjs` `biotechChangeBody` (C2C-CC-001) and `mdx-qms.mjs` `mdxChangeBody` (the NP-100
  software release) send their own pack's program.
- **Red first.** `qms-change-program.test.mjs`: on the extracted bodies 2 of 3 fail (`change-program-red.log`); with the
  fix 3 of 3 pass; all pack tests 142 of 142 (`tests.log`).
- **In the running app.** A change control created with the new body answers 201 with `program_id` =
  C2C-101's (`change-program-live.log`).
- **Not changed, said here:** a change control that already exists without a program (any database seeded before this)
  keeps none. PATCH `/api/mdx/qms/changes/:id` has no `programId` field, and the pack finds the record by its number
  and does not re-create it.

## Follow-up (the coordinating session's ruling (b), for after 23:00 UTC): the MDX program is created in its fictional sponsor's workspace

- **What already exists.** The MDX pack created the NeuroPanel-Dx 510(k) program with no client workspace
  (`packs/mdx.mjs` `seedProgram`), the same latent failure as C2C-201: once the Lumen pack's workspace exists, any run
  that must create the program is refused `AMBIGUOUS_CLIENT_WORKSPACE`. The Lumen pack's `ensureClient` (GET/POST
  `/api/clients`, by slug) is the pattern reused.
- **What changed (creation-only).** The program is looked up first and, when found, used wherever it is — never moved
  or refused. Only when it must be created does the pack ensure `MDX_CLIENT` ("Concept2Cure Diagnostics (fictional
  demo)") and create the program there (`mdxProgramBody(clientWorkspaceId)`). A database where the program exists gets
  no new workspace.
- **Red first.** `mdx-program-workspace.test.mjs`: on the extracted body 1 of 2 fails (`mdx-workspace-red.log`); with the
  fix 2 of 2; all pack tests 144 of 144 (`tests.log`).
- **In the running app.** `mdx-run.log`: `--pack mdx` exits 0; the program is found where it was (existing), no
  workspace created. `mdx-create-live.log`: the creation path — the sponsor workspace is created and a program created
  with the new body answers 201, recorded in that workspace.

## Superseded on merge with trunk (2026-11-12)

Trunk fixed the same C2C-201 workspace problem independently while this commit waited: `biotech.mjs` records the
program's `clientWorkspaceId` in `describeProgram` and creates C2C-201 through `sameSponsor(c, program)`, the existing
explicit-workspace path, tested in `demo-recovery.test.mjs`. On merging trunk into this session's commits, `biotech.mjs`
takes trunk's version whole and `biotech-program-workspace.test.mjs` is removed, so one mechanism remains (zero
duplication). What this commit adds and trunk does not have stays: the submission found by the program's own id
(`biotech-submission.mjs` `canonicalSubmissionFor`, `biotech-submission-spine.test.mjs`), the change controls created
on their programs, and the MDX program created in its sponsor's workspace.
