# D2: /api/programs was served in production because Projects claimed it

**Row:** D2 (every surface outside the launch catalog is off in production).
**Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`. **Date:** 2026-09-29.

## Finding

Found while sweeping download handlers for the D5 records work
(`docs/evidence/D5-EXPORTS-RECORDED/2026-09-29/`). Three of them are served in
production under `/api/programs/:programId/…`: the predicate-intel render
download, the defense-packet CSV and the RTM CSV. None belongs to a launch
surface.

`Projects` and `Project home`, both launch surfaces, each listed all of
`/api/programs` in `apiPrefixes`. The claim dates from the first registry
(`f1078f82a`, 2026-06-16). The launch-scope gate lets a path through when any
claimer of its longest prefix is a launch surface, so everything under that
prefix passed. The real route registration mounts 26 routes there:

| Routes | What they are | Writes |
|---|---|---|
| 21 `/api/programs/:id/predicate-intel/*` | Device 510(k) predicate intelligence: defense packets, proof packs, safety-signal ingest, lineage, renders | 10 |
| 1 `/api/programs/:id/se-matrix/render` | 510(k) substantial-equivalence render | 1 |
| 4 `/api/programs/:id/rtm*` | Requirements traceability matrix over `evidence_claims`, a store nothing writes to (see the header of `server/routes/rtm-export.ts`) | 1 (`POST …/rtm/snapshot`) |

No client file calls `/api/programs` (searched `client/src`). Projects uses
`/api/projects`; Mission Control uses `/api/mission-control/programs`; the pdev
screens use `/api/pdev/programs`.

## Change

- `projects` and `project-home` no longer claim `/api/programs`.
- `device-510k`, the app these routes serve, claims it. That app is outside the
  launch catalog, so the routes read `out-of-scope` rather than `unmapped`, and
  promoting the 510(k) workbench into the catalog brings them back with no
  further edit.

## Proof

| Check | Before | After |
|---|---|---|
| `launch-scope-api-gate.test.ts`: "refuses the device predicate-intelligence and RTM routes under /api/programs, and passes Projects" | 1 failed of 27 (`gate-red.txt`): `/api/programs/7/predicate-intel/defense-packet/build` passed | 27/27 (`gate-green.txt`) |
| Real route registration, production posture (`scripts/ci/launch-scope-route-inventory.ts --rows`, throwaway copy of `c2c_testdb`), HEAD registry vs. this change | — | **26 routes launch → out-of-scope, 12 writes; no other route changed** (`route-verdict-diff.json`) |
| `ci:launch-scope-api` | — | 269 paths named by launch and shell screens; none refused |

Neighbouring suites pass: `shared`, `server/services/entitlements`,
`server/middleware` and the AnA launch-scope suite (87 files, 1,029 tests).
Lint shows only the registry file's existing `max-lines` warning.

## Not in scope here

The inventory's "unmapped namespace called by a launch screen" report lists
`/api/c2c/actions` and `/api/510k`, as it did before this change. Neither is a
live break. It reports by namespace, and Submission Center calls only paths that
are claimed: `/api/c2c/actions/sign`, `/api/510k/estar/submissions` and
`/api/510k/estar/assemble`.
