# P-122 · Reporting: project groups, reached (2026-11-12)

**Packages:** F1 (the route repair, this folder's `server/`), then R1 (the reach). **Session:** the reporting session
(`session_011HLkYC…`, lane L11). **Why:** founder decision P-122 §3: what was built and never shown is reached. The
inventory (`../../inventory/qms-reporting-device.md` §3) lists `GET/POST/PATCH /api/report-os/program-groups*` and
`GET/POST …/:id/snapshots` as "Portfolio groups: cross-project roll-ups with snapshots", with no screen, so production
refuses them as unmapped.

## What already exists (RULE 3)

Searched: `program-groups`, `programGroup`, `program_group`, `reportProgramGroups`, `report_program_group`,
`scopeType: 'program'`, `project group`, `fetchPortfolioReport`, `portfolio.board_pack`, and `*rogramGroup*`,
`*ortfolioGroup*` in deleted history (`git log --diff-filter=D`; this clone is shallow, 957 commits; nothing found).

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| The tables | `migrations/0014_report_os_foundation.sql`: `report_program_groups`, `report_program_group_projects`, `report_program_group_snapshots` | A named group of projects in one organization, its members (same-organization keys since 2026-10-13), and dated snapshots of its member set with a hash | — |
| The routes | `server/routes/report-os.ts`: `GET /program-groups`, `POST`, `PATCH /:id`, `GET` and `POST /:id/snapshots` | List the groups whose every member the reader may open; create; rename, describe, archive and replace members; record and list snapshots | No client calls any of them. See "Found in the routes" |
| Runs over a group | `POST /api/report-os/runs` with `scopeType: 'program'`, `scopeId: <group id>` | 14 register report types compute at this scope on the demo database. They count the organization's records, as their cards already say | The Executive Readiness Digest answers 422 `REPORT_TYPE_NOT_COMPUTED` over a group. `portfolio.board_pack` is not a registered type |
| The group roll-up | `GET /api/report-os/portfolio?programGroupId=` (`portfolio/fetch.ts` `fetchPortfolioReport`) | A readiness roll-up over one group's projects, Enterprise | Claimed by AnA Command, not Reporting (`ui-surface-registry.ui-v2.ts`, "DO NOT CLAIM /api/report-os/portfolio HERE") |
| AnA | `server/services/report-os/ana/report-tools.ts` | AnA can read a portfolio by group | — |
| The word | `insightsLibraryShared.tsx` `scopeWord`: `program` → "project group" | Reporting already says "Runs over … a project group" on 14 cards and in a filter | A reader has no way to make or choose one |
| The projects a reader can open | `GET /api/insights-canvas/overview` → `programs` (`programChoices`) | Program id, code and label, for the picker and the global schedule | No integer project id, which the group routes take |
| Cross-project views in Reporting | `Insights.tsx`: the readiness board (`kind: 'portfolio'`, Enterprise) and the global schedule (`GlobalSchedule`, every plan) | Both over every project the reader can open | Neither can be narrowed to a named set |

## Found in the routes, and repaired first (F1)

Probed in the running app before any screen was written (the copy admitted the prefix locally; RLS and launch scope
enforced; the demo organization's seven projects).

1. **A change was not validated.** `PATCH /program-groups/1` with `{ "status": "nonsense", "name": "" }` answered
   **200**. The group was saved with no name and a status no reader lists, so it vanished from the default list.
2. **No audit row, and no transaction.** Creating a group, changing it and recording a snapshot wrote no row on the
   organization's audit chain. The group and its members were separate statements on the pool, so a failure between
   them left a group with no members. A run, a pack and a delivery each write one chained row on the same tenant
   transaction as the record.

Repaired in `server/routes/report-os.ts`:
- `updateProgramGroupSchema`: a trimmed, non-empty name (200 at most); a description (2,000 at most, or null); a status
  of `active` or `archived`; at least one positive integer project id when members are sent; no other field; at least
  one change. A group id that is not a positive integer is refused. All before anything is read.
- `POST` also refuses a name of spaces.
- Each write runs in one tenant-stamped transaction with its chained audit row:
  `report_os.program_group_created`, `report_os.program_group_updated` (with the members before and after when they
  change) and `report_os.program_group_snapshot_recorded`. When the audit row cannot be written, nothing is committed.
- Restoring an archived group clears its archive time.

### Red first, and green (`server/`)

| File | What it shows |
|---|---|
| `red.txt` | The new `report-os-program-groups.test.ts` on the old routes: 13 of 15 fail (every validation case, the three transactions, the roll-back) |
| `green.txt` | All 91 Reporting route and service files: 1,141 of 1,141. One older case (`report-os-saved-read-access`, the forged snapshot binding) now reads the insert off the transaction's connection |
| `after-running-app.txt`, `probe.mjs` | The same probes after the repair, on real PostgreSQL as the runtime role: the three bad changes answer 400 with the field named; create, change and snapshot answer 201/200/201; another organization's id answers 404; the chain holds the three rows, each with its 64-character chain hash |

## The reach (R1)

Filed with the screen: see the sections added below when it lands.
