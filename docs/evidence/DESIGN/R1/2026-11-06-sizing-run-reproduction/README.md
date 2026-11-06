# R1: the stored sample-size run, named and reproduced in the protocol's Statistics tab (2026-11-06)

Package R1 (reach), with the F1 repairs the reach exposed. Session `01QoxbLd…`.

## What already exists (RULE 3)

- **`GET /api/biostat-bridge/computation-runs/:runId/reproduce`** (`server/routes/biostat-bridge.ts`). It recomputes a
  stored run and reports four facts on their own: inputs intact, outputs intact, reproduced, and engine version
  matches. It was served, and no screen called it. R1 inventory (`../2026-11-01-inventory/`): S3, `biostat-bridge.ts`.
- **`reproduceComputationRun`, `recordComputationRun`** (`server/services/stats/computation-runs.ts`), and the
  `public.stats_computation_runs` table (`migrations/20261008f`). Each "Apply sample size to design" stores the run
  in the transaction that writes the N (`applySampleSizeToDesign`, `server/services/biostatistics-bridge/bridge-service.ts`).
- **The protocol's Statistics tab**: `BoundDesignCard` in `client/src/concept2cure/v2/surfaces/biostatBridge.tsx`,
  inside `ProtocolDev.tsx`. It showed the planned N and offered "Apply sample size to design". It did not show which
  run computed the N. The run id existed only as a phrase in the plan's evidence label ("stored run #N",
  `computationToPlanPatch`).

Nothing was added beside these. The assessment names the run, and the existing card asks the existing route.

## What changed

| Change | Where |
|---|---|
| The assessment names the stored run behind the planned N as `sizingRun`: `found` (run id, when it was recorded, and the N its stored outputs give), `none`, or `unreadable`. A failed read is never said as `none`. | `bridge-service.ts` `sizingRunFor`; `computation-runs.ts` `latestRunFor` |
| One rule for "the planned N of a computation" (the attrition-adjusted total, else the total). It is used both for the N written onto the design and for the N read back from a run. | `design-adapter.ts` `plannedSizeOf` |
| The design card says "Stored run #1, 2026-11-06, computed 314 subjects." and offers **Check it reproduces**. The four facts are said one by one. A design whose N was changed after the run shows both figures. With no run, it says "No stored engine run is recorded for the planned N of 375." | `surfaces/biostatSizingRun.tsx` (split out of `biostatBridge.tsx`, same folder) |
| **F1, found by this reach:** the reproduce route answered 404 for the organization's own run, with RLS enforced. | `bridge-service.ts` `reproduceSizingRun` |
| **F1, found walking it:** the protocol workspace's selection bar and protocol sat side by side. | `ProtocolDev.tsx`, `protocol-dev-editing.css` `.pde-shell` |
| **F1:** at 390 px the protocol select ran past the bar's edge. | `protocol-dev-editing.css` `.pde-picker` |

### The 404 (F1)

`reproduceSizingRun` checked out a client with `pool.connect()` and queried it outside a transaction. The pool's
scope layer (`server/db/poolInstrumentation.ts`, `wrapClientForScope`) writes the tenant's settings onto a
checked-out client only after a `BEGIN`. So the read ran with no tenant, the policy on `stats_computation_runs` hid
the row, and the route said `NOT_FOUND`. Its route test mocks the service, and nothing else called it, so this was
never seen. It now reads through `pool.query`, which scopes each statement.

`reproduce-under-tenant-scope.test.ts` drives the real scope layer over a fake connection that records each
statement. It asserts that the reproduce `SELECT` runs on a connection where `app.current_tenant_id` was set first.
It failed on the old code with "the read ran on a connection with no tenant", and passes now.

### The layout (F1)

The shell's `.page-full` is a flex row, and each full surface gives it one child. `ProtocolWorkspace` returned two:
the selection bar and the protocol. At 1440 px the bar took 819 px and the protocol 325 px, with its tabs and
panes clipped (`01-before-two-roots-1440.png`). Both now sit in one column root (`.pde-shell`): the bar takes
1144 px and the protocol 1176 px (`02-run-reproduced-1440.png`). At 390 px the page does not scroll sideways
(`scrollWidth` 390), and the protocol select now fits its box (`03-protocol-workspace-390.png`).

## Used in the running app

Local server, `RLS_ENFORCE=on` and `LAUNCH_SCOPE_ENFORCE=on` (production's default), on the Lumen demonstration pack.
Everything was walked as the author.

1. LMN-201 → "Write the protocol in the protocol workspace" → Start a protocol (`POST
   /api/protocol-development/documents` 201).
2. Study design → Bind a study design → the seeded RePreve design (`POST …/documents/1/study-design` 201).
3. Statistics. The card said "No stored engine run is recorded for the planned N of 375." The 375 is the public
   listing's planned enrolment, which no engine run computed. The engine's figure for the design is 314.
4. Apply sample size to design (`POST /api/biostat-bridge/designs/:id/apply-sample-size` 200). The card now says
   "314 planned subjects" and "Stored run #1, 2026-11-06, computed 314 subjects."
5. Check it reproduces:
   - before the scope fix: `GET …/computation-runs/1/reproduce` → 404 `NOT_FOUND`, for the run the card had just
     named;
   - after it: 200, and the card listed "Stored inputs: intact · Stored outputs: intact · Recomputed: the engine
     gives the stored result again · Engine version: the same as the run's".

No other request failed and the page raised no error.

## Tests (each fails on the old code and passes now)

- `client/src/concept2cure/v2/__tests__/biostatSizingRun.test.tsx` (7 cases):
  - the run line, which reads nothing until asked;
  - both figures shown when the N was changed;
  - `none` and `unreadable`, each in its own sentence;
  - nothing shown when there is no N and no run, or when the server does not name runs;
  - the four facts, said one by one;
  - which fact failed, in its own words;
  - a failed reply, or one without the facts, said as a failure.
- `protocolStatisticsTab.test.tsx`: the tab names the run and calls the route, and the workspace gives
  `.page-full` one root.
- `server/services/stats/__tests__/reproduce-computation-run.test.ts`: `latestRunFor` is scoped to the
  organization, the design and the purpose.
- `server/services/biostatistics-bridge/__tests__/design-adapter.test.ts`: `plannedSizeOf`.
- `server/services/biostatistics-bridge/__tests__/bridge-tasks-ledger.pglite.integration.test.ts`:
  - `unreadable` while the table cannot be read;
  - the latest run of this organization for the design and purpose. Another organization's newer run and a run for
    another purpose are not named.
- `server/services/biostatistics-bridge/__tests__/reproduce-under-tenant-scope.test.ts`: the scope fix.

## Found and not fixed here

At 390 px the protocol's cover head is cramped. The title wraps in a narrow column beside "Ask AnA" and "Export",
and "Clinical protocol" overlaps "v0.1 · updated" (`03-protocol-workspace-390.png`). Its rules are in the shared
`misc-surfaces-v2.css` and `research-v2.css`, not the protocol's own sheet. It is left for the design lane's phone
pass.
