# Fold F1, slice B: Engineering does everything Risk and Design controls do, for the open project

Launch row D2 (one AnA; the device folds). Date 2026-10-29. Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, F1, "Parity" and "Work" item 4. Built on slice A (`59b1482d2`, `docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/`).

Engineering (`mdx/surfaces/EngineeringSurface.tsx`) now mounts the Risk screen's ISO 14971 register and the Design controls screen's trace, for its project. They are not copies: the register and the trace moved out of `Risk.tsx` and `DesignControls.tsx` into two shared components. All three screens mount those, so each function has one implementation and two mounts until the fold.

This slice does not fold anything. `Risk.tsx` and `DesignControls.tsx` stay, and the registry, launch scope, catalogue and host are untouched. That is slice C.

**Status: done.** Limits are listed under "Not done, and what slice C needs".

## What already exists

Re-verified at `1a6701ea6` before writing anything. All paths are under `client/src/concept2cure/` unless rooted.

| Function | Where it was (component, path at head) | Route it calls | What Engineering had |
|---|---|---|---|
| Risk register for the project | `v2/surfaces/Risk.tsx` `Risk`: `useLiveRows('/api/mdx/risk-items')` (:219), with no project | `GET /api/mdx/risk-items` (`server/routes/mdx-risk-management.ts:182`). Since slice A it admits `?program_id=` and reports `meta.scope` | 4 rows of the engineering route's risks (`visibleRisks.slice(0, 4)`, :675) |
| 5x5 matrix, initial/residual toggle | `Risk.tsx` :726-776 (`riskmx`, `seg-b` Initial/Residual) | the same read | a residual-only heatmap (`.eng-heat`, :581-650) over the engineering route's `residual` cell |
| Hazard drawer | `Risk.tsx` :777-830 (`risk-drawer`) | the same read | none |
| Metrics | `Risk.tsx` :709-724 (`metrics`, four tiles), with the lead `AnswerLead` :648-707 | the same read | an "Open risks" card from the engineering route's summary (kept, unchanged) |
| Add hazard | `Risk.tsx` `addHazard` :498, `C2CForm` | `POST /api/mdx/risk-items` (:211; editor gate and `admitProject` since slice A). `Risk.tsx` sent no `programId` | none |
| Add control | `Risk.tsx` `addControl` :532 | `POST /api/mdx/risk-items/:id/controls` (:482) | none |
| Accept residual (signed) | `Risk.tsx` `openAcceptance`/`signAcceptance` :568-578, `EsignModal`, `postResidualAcceptance` :177 (slice A) | `PATCH /api/mdx/risk-items/:id` with `status: 'accepted'` through `signGovernedAct` (:383) | none |
| AnA drives the matrix | `Risk.tsx` `useSurfaceActionHandlers('risk', …)` :271-358; `shared/navigation/surface-actions.ts` `risk.set-matrix-view`, `risk.select-hazard`, `risk.focus-cell` (:520-575) | none (view state) | none; nothing registered on `device-engineering` |
| Entity context on hazard selection | `Risk.tsx` :245-251 (`window.C2C.setContext({ entityType: 'risk', … })`) | none | none |
| Trace matrix (project-scoped) | `v2/surfaces/DesignControls.tsx` :505-535 over `useLiveRows('/api/design-controls?program_id=')` (:165, slice A) | `GET /api/design-controls` (`server/routes/design-controls.routes.ts:113`) | one line, "N traceability rows tracked · M verified" (:695-716), from the engineering route's trace |
| Gap breakdown, "Close the first gap" | `DesignControls.tsx` `AnswerLead` :474-502 (`firstGap` :248) | the same read | none |
| §7.3 checklist | `DesignControls.tsx` :538-560, `designControlChecklistDefs` :130 over `QMSR_CROSSWALK` | the same read | none |
| Add a design input | `DesignControls.tsx` `addInput` :290-319, "New design input" :418-423 | `POST /api/design-controls` (:141; `requireEditorAccess` and `admitProject` since slice A) | none |
| Per-row Ask AnA | `DesignControls.tsx` :521 (the hazard an input controls), :548 and :555 (checklist Set up / Resolve) | none | none |
| The refusal wording | `mdx/surfaces/EngineeringSurface.tsx` `REFUSAL_WORDS` and `ProjectRefused` :103-135 (`b6831819`), with `projectRefusalOf` in `mdx/hooks/useEngineering.ts` | — | the whole screen only |
| The role read | `shared/constants/permissions.ts` `canGovernedWrite`, as `v2/surfaces/Labeling.tsx:170` uses it (the labeling viewer slice) | — | Engineering had no writes |

Searches run (Rule 3):

- `RiskRegister`, `HazardDrawer`, `RiskMatrix`, `TraceMatrix`, `DesignTrace`, `riskmx`, `dc-matrix`, `risk-items` across `client/src`. The only hits were `Risk.tsx`, `EngineeringSurface.tsx` and two unrelated registers:
  - `v2/surfaces/RbmSurfaces.tsx` `RiskMatrix`: RBM likelihood × impact over `rbm-risk-items`;
  - `v2/surfaces/ProtocolDevRegisters.tsx` `RiskTab`: a protocol risk register.

  Both are other registers in other stores, not ISO 14971, so neither is this capability.
- `canGovernedWrite` across `client/src` and `shared`.
- `usePublishSurfaceContext(` and `useSurfaceActionHandlers(` across `client/src/concept2cure`. Nothing under `mdx/` registered actions.
- `git log --all --diff-filter=D` on `*RiskRegister*`, `*RiskMatrix*`, `*HazardDrawer*`, `*TraceMatrix*`, `*DesignTrace*`, `*Heatmap*`, `client/**/*Risk*`, `client/**/*DesignControl*` and `client/**/*Engineering*`: nothing deleted.

Nothing is built beside an existing piece. The register and the trace are `Risk.tsx`'s and `DesignControls.tsx`'s own code, moved: their logic, markup and comments come across as they were. Engineering's three partial copies (the heatmap, the four rows and the trace line) are removed in the same change. The refusal words moved out of Engineering into the shared module rather than being written a second time.

## Parity

| Function | Source | Now in Engineering |
|---|---|---|
| Trace matrix, project-scoped | `DesignControls.tsx` | Yes: `DesignControlsTrace` in the "Design controls · DHF" section, over `GET /api/design-controls?program_id=` |
| Gap breakdown and "Close the first gap" | `DesignControls.tsx` | Yes (`TraceLead`); the action asks AnA about the first gap |
| §7.3 checklist | `DesignControls.tsx` | Yes (`TraceChecklist`, 9 elements, 4 "Not tracked in this store") |
| Add a design input (project, editor) | `DesignControls.tsx` | Yes: "New design input" in the section head; the POST carries `programId`; offered to a writing role only |
| Per-row Ask AnA | `DesignControls.tsx` | Yes: the hazard link on each row, and Set up / Resolve on each checklist row |
| Full risk register for the project | `Risk.tsx` | Yes: `RiskRegister` in the "Risk management · ISO 14971" section, every hazard, over `GET /api/mdx/risk-items?program_id=` |
| 5x5 matrix, initial/residual toggle | `Risk.tsx` | Yes (`RiskMatrix`) |
| Hazard drawer | `Risk.tsx` | Yes (`HazardDrawer`) |
| Metrics | `Risk.tsx` | Yes (`RiskMetrics`, and the lead) |
| Add hazard | `Risk.tsx` | Yes: "New hazard" in the section head; the POST carries `programId` |
| Add control | `Risk.tsx` | Yes, from the drawer |
| Accept residual (signed, slice A) | `Risk.tsx` | Yes: the same `postResidualAcceptance` and `EsignModal`, now in `RiskRegister.tsx` |
| AnA drives the matrix | `Risk.tsx`, `risk.*` | Yes: `device-engineering.set-matrix-view`, `.select-hazard` and `.focus-cell`, the same handlers. `risk.*` stays on Risk until the fold |
| Entity context on hazard selection | `Risk.tsx` | Yes, the same effect |
| The "store not provisioned" state | `DesignControls.tsx` | Yes (it was already present; it moved with the trace) |
| Record V&V, verification-of-effectiveness evidence | — | Not real today on either screen, so not carried |

## What changed

New shared files:

- **`v2/projectScopedRead.tsx`**: one read for the open project, and the refusal in words.
  - `useProjectScopedRead(base, { programId, requireProject, waiting, refusal })`:
    - with a project, it reads `?program_id=`;
    - an answer is the project's only when it says `meta.scope: 'program'` and that `programId`. Anything else is `unkeyed` and has no rows;
    - with no project, it reads the organization's records (the older screens), or nothing (Engineering);
    - `waiting` holds the read until the screen's own route has answered;
    - `retry` reads again.
  - `projectRefusalOfRead`: 404 "Project not found" is `not-visible`; 503 `VERIFICATION_UNAVAILABLE`, by code, is `unchecked`.
  - `ProjectRefused` is Engineering's component, moved, with the record named by its caller:
    - "This project isn't one this organization can see" / "Nothing was read for it, so no risk record is shown.";
    - "This project couldn't be checked, so nothing was shown", with Try again.
- **`v2/surfaces/RiskRegister.tsx`**: `Risk.tsx`'s register, moved.
  - `useRiskRegister(opts)` holds the read, the rows, the selection, the view, the forms, the signature dialog, the writes, AnA's handlers (`<surfaceId>.*`), the entity context and the AnA context.
  - `<RiskRegister register onAsk />` draws it.
  - `mapRiskItems` and `postResidualAcceptance` moved here; `Risk.tsx` re-exports them.
- **`v2/surfaces/DesignControlsTrace.tsx`**: `DesignControls.tsx`'s trace, moved.
  - `useDesignControlsTrace(opts)` holds the read, the session's added inputs, the roll-up, the checklist, the first gap, the add-input write and the AnA context.
  - `<DesignControlsTrace dc onAsk />` draws it.
  - `designControlChecklistDefs` moved here; `DesignControls.tsx` re-exports it.

Changed files:

- **`v2/surfaces/Risk.tsx`** is the header and the publish of `risk`'s AnA context over `RiskRegister`.
  - With a project open it now reads that project's register and names it on a new hazard. Slice A left that open.
  - With none open it reads the organization's, with byte-identical copy.
- **`v2/surfaces/DesignControls.tsx`** is the header and the publish of `design-controls`'s context over `DesignControlsTrace`.
- **`mdx/hooks/useEngineering.ts`**:
  - `answered`: the route has answered for this project, with a payload or a failure;
  - `ProjectRefusal` now comes from the shared module, re-exported.
- **`mdx/surfaces/EngineeringSurface.tsx`**:
  - mounts the two sections for the project. Their reads wait for `answered`, and nothing is read when the route refused the project;
  - drops the residual-only heatmap, the four-row risk list and the trace line from the accordion, which now holds DHF, change requests and non-conformances;
  - uses the shared `ProjectRefused`.
- **`shared/navigation/surface-actions.ts`**: `riskMatrixActions(surfaceId, where)` defines the three actions once, registered for `risk` and `device-engineering`. The `risk.*` entries are unchanged: their JSON is identical to head's, and so is the order of the other 105 ids.

**What a viewer sees.** On all three screens, a permissions array without `governed:write` hides "New hazard", "Add risk control", "Accept residual" and "New design input". The screen shows "View only. …" instead (`risk-view-only`, `design-controls-view-only`). A session with no permissions array is offered the controls, as `canGovernedWrite` documents, and the server still decides (`requireEditorAccess`). AnA's `availableActions` leave out the writes for a viewer.

**What does not change.** `Risk.tsx` and `DesignControls.tsx` draw the same markup as before, over the same reads, when no project is open.

Two small additions:

- the failed-read states now offer Try again;
- the empty states tell a viewer they cannot add.

### Removed from Engineering, and what replaces it

| Removed | Replacement, by path | Test that pins it is reachable |
|---|---|---|
| Residual-only heatmap (`.eng-heat`) with cell filter | `RiskRegister.tsx` `RiskMatrix`, initial and residual, in Engineering's risk section | `EngineeringSurface.riskRegister.test.tsx` ("draws the whole register", "switches the matrix"); `EngineeringSurface.unreadable.test.tsx` ("draws the matrix when the risk file read cleanly") |
| Four-row risk list (`.eng-risks`) | `RiskRegister.tsx`, every hazard on the matrix, and the drawer | `EngineeringSurface.riskRegister.test.tsx` |
| "N traceability rows tracked" line | `DesignControlsTrace.tsx` matrix and roll-up | `EngineeringSurface.designControls.test.tsx`; `EngineeringSurface.traceKeyed.test.tsx` |

Mutations M1 to M5 and M12 are each red on these tests.

### Existing tests changed, and why

Each change follows a function that moved. None weakens what the test pins.

- **`EngineeringSurface.unreadable.test.tsx`**:
  - "no all-zero matrix over a failed risk read" and "draws the heatmap when the risk file read cleanly" now look at the register's `.riskmx`, over its own failed or clean read. On the old selector both would have passed vacuously or failed.
  - "0 of 0 shown" becomes "no hazard count over a risk file it could not read". It still checks `0 of 0 shown`, and adds the register's own counts.
  - The fetch mock routes the risk-items path.
- **`EngineeringSurface.projectKeyed.test.tsx`**:
  - the not-keyed panels are three: the trace is no longer one;
  - the `.eng-risks` line is replaced by a pointer to `riskRegister.test`;
  - the "2 traceability rows tracked" line is removed;
  - the count of empty gates is 4, not 5.
- **`EngineeringSurface.traceKeyed.test.tsx`**:
  - its two trace cases now pin the design-controls read (keyed: drawn; organization scope: not drawn), with the fetch mock routing that path;
  - the case that the organization's panels stay hidden is unchanged.
- **`designControlsNoFixtures.test.tsx`**: the source-text check reads `DesignControls.tsx` with the two files the read moved into, and accepts `useLiveData`, the fixture-free hook `useLiveRows` wraps. A comment of mine had briefly named `useLiveRows` in `DesignControls.tsx`, which would have passed the check by mention. It was removed before any run counted.
- **`server/middleware/__tests__/launch-scope-device-features.test.ts`**:
  - `HOOKS` only, as asked. `Risk.tsx` and `DesignControls.tsx` no longer name a call, so `RiskRegister.tsx` and `DesignControlsTrace.tsx` are listed for `risk`, `design-controls` and `device-engineering`.
  - The IVD lane edited the same list at the same time (the `IvdAssessmentWorkbench` entry). Its part was committed in `a86ed04ed`, so the remaining diff is this slice's lines only.

## Red, green, make the check fail

**Red (`red.txt`)**. The two Engineering files were written before any product change and run against the slice A code:

- `EngineeringSurface.riskRegister.test.tsx`: 17 failed, 1 passed (18). The one that passed, "reads nothing for a project its own route refused", was vacuous, since Engineering read no risk file at all. M19 makes it red against the change.
- `EngineeringSurface.designControls.test.tsx`: 13 failed (13).
- `riskAndDesignControlsSharedMounts.test.tsx` (Risk reads the project; viewers on the older screens) was written after the change. M21, M25 and M26 are its red.

**Green (`green.txt`)**. 33 files, one at a time, every one exit 0, 306 tests:

- the Engineering suites (6) and `useEngineering`;
- Risk (4) and Design controls (4), with the qmsr test;
- `anaDrives*` (6), `surfaceActions` (2), `shared/navigation` (3), `clientCopyNoProgram` and `registryModel`;
- `launch-scope-device-features`;
- both `tests/concept2cure` smoke suites;
- the three new files.

**Mutations (`mutation-M*.txt`)**. Each was applied alone and its test run alone. The file was restored from the bytes held in memory, and its sha256 checked (all `restored byte for byte: yes`). Afterwards the seven mutated files hash the same as before the run. The whole-tree `git diff` lost only the IVD lane's files, which were committed in `a86ed04ed` during the run.

| Id | Mutation | Test | Result |
|---|---|---|---|
| M1 | Engineering does not mount the risk register | riskRegister | red (17 failed, 1 passed) |
| M2 | Engineering does not mount the design-controls trace | designControls | red (13 failed) |
| M3 | the matrix loses its initial/residual toggle | riskRegister | red (1 failed) |
| M4 | the hazard drawer is not drawn | riskRegister | red (6 failed) |
| M5 | the register metrics are not drawn | riskRegister | red (1 failed) |
| M6 | Engineering offers no New hazard | riskRegister | red (2 failed) |
| M7 | the drawer offers no Add risk control | riskRegister | red (2 failed) |
| M8 | the drawer offers no Accept residual | riskRegister | red (2 failed) |
| M9 | AnA's matrix actions register under `risk` on Engineering | riskRegister | red (2 failed) |
| M10 | selecting a hazard sets no entity context | riskRegister | red (1 failed) |
| M11 | the gap breakdown offers no "Close the first gap" | designControls | red (1 failed) |
| M12 | the §7.3 checklist is not drawn | designControls | red (1 failed) |
| M13 | the matrix rows lose their Ask AnA | designControls | red (1 failed) |
| M14 | Engineering offers no New design input | designControls | red (5 failed) |
| M15 | the read drops the project (reads the organization) | riskRegister | red (17 failed, 1 passed) |
| M16 | a new hazard names no project | riskRegister | red (1 failed) |
| M17 | a new design input names no project | designControls | red (1 failed) |
| M18 | an answer not keyed to the project is drawn | riskRegister | red (3 failed) |
| M19 | Engineering does not wait for its own route (reads a refused project) | riskRegister | red (1 failed) |
| M20 | a refused read is not put into words (404 and 503) | designControls | red (2 failed) |
| M21 | a viewer is offered the register's write controls | riskRegister | red (1 failed) |
| M22 | a viewer is offered New design input (the trace) | designControls | red (1 failed) |
| M23 | Engineering's New hazard ignores the role | riskRegister | red (1 failed) |
| M24 | the registry lists no `device-engineering` matrix actions | riskRegister | red (2 failed) |
| M25 | Risk reads the organization with a project open | sharedMounts | red (2 failed) |
| M26 | Design controls offers New design input to a viewer | sharedMounts | red (1 failed) |

26 of 26 red, each on its own target.

## Gates

- **eslint (`eslint.txt`)**, plain `npx eslint --no-ignore` on every changed and new file: 0 errors, and 11 warnings against 18 at head on the same files.
  - `Risk.tsx` went from 7 to 0 and `DesignControls.tsx` from 2 to 0; `RiskRegister.tsx` carries 3. The new test files carry none.
  - `useEngineering`'s complexity went from 16 to 17, still 1 warning.
- **Type check (`typecheck.txt`)**:
  - The 17 files and everything they import, under the repo's compiler options plus the ambient declarations, give 0 errors (`typecheck-tsconfig.json`).
  - The whole-tree `typecheck:fast` was killed for memory here (exit 137: 15 GB, no swap). It has not been run on this slice.
- **Other gates (`gates.txt`)**, all exit 0:
  - `ci:undefined-css-classes` and `ci:class-vocabulary`;
  - `ci:fixture-fallback` and `ci:unauthenticated-fetch`;
  - `ci:launch-scope-api` and its selftest;
  - `check-ana-surface-context` (112 exact; the `risk` and `design-controls` publishers stay where they were).

## Not done, and what slice C needs

1. **AnA's screen context on Engineering.** The host publishes `device-engineering`'s context (`mdx/MdxSurfaceHost.tsx`, which is not mine to edit). The register and trace compute their AnA context (`register.anaContext`, `dc.anaContext`), and today only `Risk.tsx` and `DesignControls.tsx` publish it. At the fold, the host's `device-engineering` context should carry both. AnA already has the three actions on Engineering: the registry advertises them for `device-engineering`.
2. **Entitlement prefixes (step 3 of the checklist).**
   - Engineering now calls `/api/mdx/risk-items`, claimed by `risk` in `shared/constants/ui-surface-registry.ts`, and `/api/design-controls`, claimed by `design-controls` in `ui-surface-registry.ui-v2.ts`. `device-engineering` claims only `/api/mdx/engineering`.
   - So an organization entitled to `device-engineering` but not `risk` or `design-controls` would have those two reads refused by the module gate (403). The panels then show a failed read, never rows.
   - Moving both prefixes onto `device-engineering` is the fold's job, along with the grant mapping in the plan's decisions.
3. **The fold itself:**
   - aliases `risk` and `design-controls` → `device-engineering`;
   - removal from the registry, `launch-scope.ts`, `mdx-project-features.ts`, the catalogue (Rule 1, amended in place) and the tours (`demo-scripts.ts` still names `risk.set-matrix-view` and `risk.select-hazard`);
   - deleting `Risk.tsx` and `DesignControls.tsx`;
   - dropping `riskMatrixActions('risk', …)`;
   - `ID_BASELINE` minus the two publishers;
   - `HOOKS` keeps the two shared files under `device-engineering` only.
   - When Risk folds, the register's `surfaceId` option and the older screens' org-wide branch (`requireProject: false`) can go.
4. **Left unreferenced by this slice, in files outside its edit list:**
   - `ENG_RISK_SEVERITY` and `ENG_RISK_PROB` in `mdx/data/engineering.ts`;
   - the `.eng-heat*`, `.eng-risks`, `.eng-risk-*` and `.chip-filter` rules in `mdx/app.css`. `.eng-grid` is still used by Postmarket.
   - The engineering route still reads the trace (`server/routes/mdx-engineering.ts`, slice A item 3) and `useEngineering` still maps it, but no panel draws it now. Either the route stops reading it, or a later panel uses it.
5. **The whole-tree type check** has not been run here, for lack of memory.
6. **Mutation windows.** Each mutation lived in the shared tree for one test run, about 5 to 15 seconds. The IVD commit `a86ed04ed` landed during the run and contains none of the mutated files.

## Files

- **New:**
  - `client/src/concept2cure/v2/projectScopedRead.tsx`
  - `client/src/concept2cure/v2/surfaces/RiskRegister.tsx`
  - `client/src/concept2cure/v2/surfaces/DesignControlsTrace.tsx`
- **Changed:**
  - `client/src/concept2cure/v2/surfaces/Risk.tsx`
  - `client/src/concept2cure/v2/surfaces/DesignControls.tsx`
  - `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx`
  - `client/src/concept2cure/mdx/hooks/useEngineering.ts`
  - `shared/navigation/surface-actions.ts`
- **New tests:**
  - `client/src/concept2cure/mdx/surfaces/__tests__/EngineeringSurface.riskRegister.test.tsx`
  - `client/src/concept2cure/mdx/surfaces/__tests__/EngineeringSurface.designControls.test.tsx`
  - `client/src/concept2cure/v2/__tests__/riskAndDesignControlsSharedMounts.test.tsx`
- **Tests changed** (above):
  - `EngineeringSurface.unreadable.test.tsx`, `EngineeringSurface.projectKeyed.test.tsx` and `EngineeringSurface.traceKeyed.test.tsx`;
  - `v2/__tests__/designControlsNoFixtures.test.tsx`;
  - `server/middleware/__tests__/launch-scope-device-features.test.ts` (`HOOKS` only).
- **Evidence:** `red.txt`, `green.txt`, `eslint.txt`, `typecheck.txt`, `typecheck-tsconfig.json`, `gates.txt`, `mutation-M1.txt` to `mutation-M26.txt`.
