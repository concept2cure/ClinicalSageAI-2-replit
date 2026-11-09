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
