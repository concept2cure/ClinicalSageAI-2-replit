# Device features reach the project: Pre-Sub, UDI and labeling

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `9cf764e5`.

**Status: done for device-presub, device-udi and labeling.** human-factors still needs a migration. It is not part
of this slice.

`9cf764e5` mapped the 21 device project features. Four of them are placed in the project, but their screens did not
read the open project. This slice reaches three of them. Each screen now reads the project that is open, and with no
project it says so. Plan's device workflow now offers a door to each one. Before any door, three server reads were
fixed: they now refuse a project the caller's organization does not own.

## What already exists

Re-verified at head before any change.

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| Pre-Sub screen | `client/src/concept2cure/mdx/presub/PreSubManager.tsx` | Lists the Q-Subs, with detail, stage strip and commitments. | It took no project. |
| Pre-Sub read | `client/src/concept2cure/mdx/hooks/usePresub.ts` `usePresubList()` | Called `GET /api/q-sub` with no `program_id`. | It never narrowed to a project. |
| Pre-Sub route | `server/routes/q-sub.ts` `GET /`; `server/services/q-sub/q-sub.service.ts` `listQSubsForOrg` | Filters on `program_id` when given one. Joins every row to `regulatory_programs.organization_id`. | It did not ask whether the organization owns the project it was given. |
| UDI screen | `client/src/concept2cure/mdx/surfaces/UdiSurface.tsx` | Shows documents in flight, blockers, the device registry, symbols and MRI. | It called `useUdi()` with no project. Its header said "Cross-program surface". |
| UDI read | `client/src/concept2cure/mdx/hooks/useUdi.ts` | Takes a project. With none, it read the organization-wide summary. | Its one caller never passed a project. |
| UDI routes | `server/routes/mdx-udi.ts` `GET /udi/summary`, `GET /udi` | Narrow every panel by `program_id`, and every row by organization. | They did not check that the organization owns the project. |
| Labeling screen | `client/src/concept2cure/v2/surfaces/Labeling.tsx` | Reads `/api/mdx/labeling?program_id=` only when given `programId`. | No caller passed one, so it read nothing. |
| Labeling route | `server/routes/mdx-labeling.ts` `GET /labeling` | Filters on `program_id` and organization. The per-document reads use `requireDocInOrg`. | It did not check that the organization owns the project. |
| Host | `client/src/concept2cure/mdx/MdxSurfaceHost.tsx` | Resolves `programForContext` from the shell's selection. Refuses to mount a leaf without it. | It listed device-udi and device-presub in `ORGANIZATION_VIEWS`, so it said "Organization-wide view" under the project's title. |
| Shell project read | `client/src/concept2cure/v2/shellProject.ts` `useShellProject`, `shellProgramId` | The open project for v2 screens. | Labeling did not call it. |
| Plan doors | `client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx` `WORK_DESTINATIONS`, `packageDestination`; `client/src/concept2cure/v2/projectDoors.ts` `DEVICE_DOORS` | One door per workstream, gated on `available(surface)`. | The labeling and registration-udi packages opened Author. Plan had no Pre-Sub door. |
| Plan placement guard | `client/src/concept2cure/v2/__tests__/ProjectMdxWorkflow.test.tsx` `REACHED_FROM_PLAN`, `NO_PROJECT_DOOR` | Places all 21 features. | — |
| Door names | `.design/client-journey/INFORMATION_ARCHITECTURE.md` section 9, "Door names". `clientNamesSlice1.test.tsx` parses it. | Fails any device door not in the table. | The three job names were in sections 5 and 6, but not in the table. |
| Ownership answer | `server/services/c2c/program-access.ts` `programInOrganization` | The one ownership check (`ci:program-ownership-single-source`). `mdx-engineering.ts` already calls it. | — |

Searches run:

- The ids, components and hooks across `client/src`, `server/routes`, `shared` and `tests`.
- `installProjectRouteAccess`, `requireCurrentProgramAccess`, `programInOrganization` and `canAccessReportProject` over `server/routes`.
- The mounts in `server/bootstrap/register-inline-routes.ts` and `register-document-routes.ts`.
- Every test that mounts these screens or calls these routes.

No second Pre-Sub, UDI or labeling screen exists. Nothing here was rebuilt. Each screen was reached through the read it
already had.

## Tenant check, per route

None of the three routes sits under `installProjectRouteAccess`. Each one filters every row by the caller's
organization, taken from the session, so another tenant's rows never came back. No route trusted a client-supplied
program id across tenants for its rows.

But none of them asked whether the organization owns the project it was given. Another organization's project, or one
that does not exist, came back `200` with no rows. A project screen shows that as "this project has none". If the
ownership lookup itself failed, nothing reported it. The red run shows 12 cases answering 200.

The fix is minimal, and it is the same in each route. When `program_id` is present, the route calls
`programInOrganization(pool, id, org)` before reading anything, as `mdx-engineering.ts` does:

- not owned: 404, and nothing is read;
- the check could not run: 503 (`respondVerificationUnavailable`).

The organization-wide read without `program_id` is unchanged.

| Route | Before | After |
|---|---|---|
| `GET /api/q-sub?program_id=` (`server/routes/q-sub.ts`) | 200 with no rows for a foreign or missing project | 404 for a foreign or missing project, 503 if the check fails |
| `GET /api/mdx/udi/summary?program_id=` and `GET /api/mdx/udi?program_id=` (`server/routes/mdx-udi.ts`) | 200 with empty panels | same as above |
| `GET /api/mdx/labeling?program_id=` (`server/routes/mdx-labeling.ts`) | 200 with no rows | same as above |

Test: `server/__tests__/routes/device-project-reads-admit-program.test.ts`. It runs five cases over each of the four
reads, 20 cases in all. `server/__tests__/routes/q-sub.test.ts` now mocks `programInOrganization` for its one filtered case.

Not changed here, and reported:

- **Project sharing inside an organization is not applied** to these reads, nor to the device-engineering read. That
  is `canAccessReportProject`, the gate `installProjectRouteAccess` uses. A member can read a private project's rows
  by its id. The organization-wide default already returned every project's rows, so this slice does not widen it.
- **Writes accept a foreign program id**: `POST /api/mdx/udi` and `POST /api/mdx/labeling` store `programId` without
  an ownership check. The row stays in the caller's organization, so no other tenant can read it. The Q-Sub create
  already checks ownership in its service.

## What changed

- **Pre-Sub.**
  - `usePresubList(programId)` reads `/api/q-sub?program_id=`. With no project, it makes no read.
  - `PreSubManager` takes `programId`. With null it says "Open a project to see its Q-Submissions" and reads nothing.
  - The filter hint reads "Clear filters to see all of this project's Q-Subs."
- **UDI.**
  - `useUdi(programId)` takes the project as a required argument, and there is no organization-wide default.
  - `UdiSurface` takes `programId`. With null it says "Open a project to check its labels' UDI".
- **Host.**
  - Passes `programForContext` to both screens, keyed by project. When the project switches, nothing from the
    previous project is drawn while the next one loads.
  - device-udi and device-presub leave `ORGANIZATION_VIEWS`.
  - Their AnA blurbs now say the records are the project's.
- **Labeling.**
  - Reads the shell's open project (`useShellProject` and `shellProgramId`). The unused `programId` prop is gone.
  - With no project, or an open project that has no project id, it reads nothing, says which case it is, and offers
    "Open projects".
  - Only a settled read names the document.
  - Copy that said "organization" now says "project".
- **Plan doors**, in `ProjectMdxWorkflow.tsx` and `projectDoors.ts`:
  - "Prepare a Pre-Sub for FDA" (`DEVICE_DOORS.preSub`) is on the regulatory strategy workstream. It is offered only
    when the project records an FDA route (510(k), De Novo or PMA), whether as its primary filing or as an added one.
    It is never offered for MDR or IVDR, and not for HDE, which `filingToken` does not record as a route.
  - "Write the label and IFU" (`DEVICE_DOORS.label`) opens `labeling`, and "Check each label's UDI"
    (`DEVICE_DOORS.udi`) opens `device-udi`. The compiler plans both packages for every device route.
  - Every door is gated on `available(id)`. If the label or UDI feature is not available, its workstream keeps the
    Author door it had (`fallback`), and the Pre-Sub door is not drawn.
  - A drug project has no device workflow (`mdxProjectPlan` returns null).
- **Guard.** device-presub, device-udi and labeling move from `NO_PROJECT_DOOR` to `REACHED_FROM_PLAN`.
- **IA section 9, "Door names"**, approved by the lead. Three rows were added, each with the name the IA already
  gives the door:
  - "Prepare a Pre-Sub for FDA", from section 5, the `device-presub` row, and slice 12;
  - "Write the label and IFU", from section 6, "Device label and IFU", and slice 20;
  - "Check each label's UDI", from the same two places.
  
  The table's "Today" cell for each is "No door". No other edit was made to that file.
- **Tests updated to the new contract.**
  - The seven `PreSubManager.*` tests and `adapterShapeSafety` pass a project.
  - The interactive smoke test passes a project to `UdiSurface`.
  - Four labeling tests open the project through the shell. `labelingRecordsNotProjectKeyed` now states the
    no-project reason.

## Proof

- `baseline.txt` has every related suite at head. Three files were already red, none of them this slice's:
  - `mdx-surfaces-interactive-smoke`, 1 case, the Files tab;
  - `launch-scope-api-gate`, 5 cases;
  - `projectMarketsDeviceAssembly`, 9 cases, from another session's ProjectMarkets edit. It is 13/13 on the later run.
- `red.txt`, at head plus the new tests:
  - server: 12 of 20 red, each foreign, missing or unchecked project answering 200;
  - the two MDX screens: 8 of 8 red;
  - labeling: 4 of 4 red;
  - Plan's doors: 52 of 53 red. At head the door constants and doors do not exist, so the cases fail on the name
    lookup itself;
  - the placement guard: red on the three moved ids.
- `green.txt`: every listed suite passes, except the two baseline reds above, which fail on the same cases.
- Mutations. Each was applied from a scratch copy, run, and restored, with the content compared byte for byte.
  `git diff` then shows only this slice's changes.
  - `mutation-M1.txt`: the Pre-Sub read drops the project. 2 tests fail.
  - `mutation-M2.txt`: the UDI read drops the project. 2 fail.
  - `mutation-M3.txt`: the labeling read drops the project. 2 fail.
  - `mutation-M4.txt`: Pre-Sub is offered on an MDR project. 5 fail.
  - `mutation-M5a.txt`: the workstream door's availability gate is dropped. 2 fail.
  - `mutation-M5b.txt`: the Pre-Sub door's availability gate is dropped. 1 fails.
  - `mutation-M6.txt`: the labeling route skips the ownership check. 3 fail.
- `eslint.txt`: each changed product file has the same count at head and now (`git show HEAD:<file> | eslint --stdin`).
  Labeling.tsx is back to its two warnings at head.
- `ci:program-ownership-single-source` passes. Every new check calls `programInOrganization`.

## Not done

- human-factors (`hf_engineering_files` has no program column; it needs a migration).
- Project sharing on these reads, and the ownership check on the UDI and labeling writes (above).
- `ProjectMdxWorkflow.test.tsx` still says "opens exactly those eight features" and "the other thirteen" in a test
  title and a comment. Plan now opens eleven. This slice was limited to the two lists in that file.
- `onOpenEditor` for a UDI row's label (IA section 5, `device-udi` row), the label template id (slice 20), and the
  Q-Sub form over `q_sub.create` (slice 12) remain.
