# The device vault admits the project; Engineering's AnA context carries its panels

Launch row D2 (one AnA; the device folds). Date 2026-10-29. Two small fixes:

- **Fix 1**, the device vault's tenant safety. The plan is `docs/design/DEVICE_FOLDS_2026-10-29.md`: its tenant pattern, and F3 "What already exists".
- **Fix 2**, AnA's context on device-engineering. This follows fold F1 slice B (`79d00b348`), README "Not done, and what slice C needs" item 1.

**Status: done.** Limits are listed under "Not done".

## What already exists

All client paths are under `client/src/concept2cure/` unless rooted. Line numbers are at head (`6184439b3`).

### Fix 1

- **`server/routes/mdx-vault.ts`, `GET /api/mdx/vault?program_id=`** (the list, :107 at head). It reads two halves:
  - the project's authored artifacts, `concept2cure_artifacts` through `projects.regulatory_program_id`;
  - its uploaded files, `vault.documents` joined to `regulatory_programs`.

  Both filter by the caller's organization, so another tenant's rows never came back. But nothing asked whether the organization owns the live project:
  - another organization's project, or a missing one, came back 200 with no rows, which the Vault draws as "this project has none";
  - the organization's own deleted project came back 200 with its files. Neither read looks at `regulatory_programs.deleted_at`, and the artifacts half does not touch `regulatory_programs` at all;
  - an ownership lookup that could not run was never made, so it could not be reported.
- **The other three routes in the file**, `/vault/:artifactId`, `/versions` and `/audit`, take no program. Each checks first that the artifact is the organization's (`concept2cure_artifacts WHERE organization_id = $1`), and `mdx-vault-audit.test.ts` pins that for `/audit`. They are unchanged.
- **Writes.** `mdx-vault.ts` has none: it holds four GETs and nothing else. So there was no write to keep or give `requireEditorAccess`. Writes into the vault go through `POST /api/vault/ingest`, which is outside this file.
- **`server/lib/admit-project.ts` `admitProject`**, over `programInOrganization` (`server/services/c2c/program-access.ts`). This is the one ownership answer, already read by `mdx-udi`, `mdx-labeling`, `human-factors`, `mdx-engineering`, `mdx-risk-management`, `design-controls` and the IVD routes. It is used as it is.
- **Tests that existed.** `server/routes/__tests__/mdx-vault-audit.test.ts` covers the audit route. `tests/mdx-beta-surfaces-routes.test.ts` covers the list's shape and the 422 for a non-uuid. Neither asked about ownership.
- **The client.** `mdx/hooks/useVault.ts` sends `program_id` only for a uuid. Any non-2xx answer becomes `error`, and `mdx/surfaces/VaultSurface.tsx` draws that as "Could not be read", with a retry (`vault-error`). It never draws an empty vault.
- **F3's target.** `v2/surfaces/Vault.tsx`, over `server/routes/c2c/project-vault.ts`, behind `installProjectRouteAccess` (:1156). Not touched here.

### Fix 2

- **The two panels' context.** `v2/surfaces/RiskRegister.tsx` `useRiskRegister` computes `anaContext` (`riskAnaContext`, :327), and `v2/surfaces/DesignControlsTrace.tsx` `useDesignControlsTrace` computes its own (`traceAnaContext`, :188). Only `Risk.tsx:27` (`risk`) and `DesignControls.tsx:27` (`design-controls`) published them.
- **`mdx/surfaces/EngineeringSurface.tsx`** calls both hooks (:131-132). It took `program`, `onAskAna` and `onOpenEditor` only, so neither context left it.
- **`mdx/MdxSurfaceHost.tsx`** publishes device-engineering's context, one of its 15 literal calls. Its summary said "the engineering and design-controls workspace", with the facts `screen`, `program` and `programCount`.
- **`v2/surfaceContext.ts`** holds one context at a time (`current`). A publish replaces it, and the reader returns only the active surface's. So a second publish from Engineering would replace the host's, or be replaced by it.
- **The hooks cannot run twice.** They hold the selection, the forms, the optimistic rows and the writes, and they register the `device-engineering.*` AnA actions. Calling them again in the host would read each panel twice and register the handlers twice.
- **A separate channel.** `window.C2C.setContext`, which the register sets on hazard selection, is the entity in context, not the screen state. It is unchanged.

### Searches run (Rule 3)

- `admitProject` and `programInOrganization` across `server/`.
- `mdx/vault?`, `vault?program_id` and `mdx-vault` across `server`, `tests`, `client/src`, `scripts` and `shared`.
- `onPanelsContext`, `PanelsContext`, `onAnaContext`, `onContextChange` and `reportContext` across `client/src`: no child-to-host context hand-off exists.
- `usePublishSurfaceContext(` across `client/src/concept2cure` (the publishers of `risk`, `design-controls` and `device-engineering`).
- `git log --all --diff-filter=D` on `*vault*admit*`, `*admits-project*`, `*PanelsContext*`, `*panelsContext*`, `*engineeringAnaContext*`, `*EngineeringContext*` and `client/**/*Engineering*`: nothing deleted.

Nothing here is built beside an existing piece:
- Fix 1 calls the existing `admitProject`.
- Fix 2 carries the panels' own `anaContext` objects as computed; nothing recomputes them.

## Fix 1: the list admits the project

`server/routes/mdx-vault.ts`, the list handler: `if (!(await admitProject(res, log, programId, orgId))) return;` is the first statement in its `try` (:171), before either half is read. This is the same placement as `mdx-udi.ts` and `mdx-engineering.ts`.

What each case now answers:
- another organization's project, a missing one, or the organization's own deleted one: 404 `{ error: 'Project not found' }`, with neither half read;
- an ownership check that cannot run: 503 `VERIFICATION_UNAVAILABLE`, with nothing read;
- no `program_id`: as before, with no lookup;
- a non-uuid: 422 as before, with no lookup;
- the 42703 fallback (422 "Project-scoped vault listing is unavailable") is unchanged.

The file header says what changed and why.

## Fix 2: device-engineering's context carries the register and the trace

- **New: `mdx/surfaces/engineeringPanelsContext.ts`.**
  - The `EngineeringPanelsContext` type is `{ programId, risk, designControls }`.
  - The prop type is `onPanelsContext?: (ctx | null) => void`.
  - `useReportPanelsContext(report, program, risk, designControls)` reports the panels' context to the host:
    - only when its content changes. The effect is keyed on `JSON.stringify` of the context, as `usePublishSurfaceContext` is;
    - null with no project;
    - null on unmount.
  - It is its own module because `EngineeringSurface.tsx` sat at exactly 500 counted lines at head, the `max-lines` limit.
- **`mdx/surfaces/EngineeringSurface.tsx`:**
  - `EngineeringSurfaceProps` extends the prop type;
  - the props are destructured on one line;
  - one call reports `risk.anaContext` and `designControls.anaContext`.

  It reports in every state, refused and loading included, since each panel's context says itself why it holds no rows.
- **`mdx/MdxSurfaceHost.tsx`:**
  - it holds what Engineering reports (`useState`) and passes `setEngineeringPanels` as `onPanelsContext`;
  - `withEngineeringPanels(base, panels, programForContext)` merges into the one device-engineering publish:
    - the summary is the host's, then the register's, then the trace's;
    - `facts.riskRegister` and `facts.designControlsTrace` are each panel's facts, or null when the panel has none (its summary says why);
    - `availableActions` is the host's, then the register's, then the trace's;
  - the merge happens only when `panels.programId` is the project in context. On a switch, the previous project's report is still held for a render, and it is not this project's;
  - the comment above `anaContext` no longer says no leaf count is ever published.
- **What does not change.** There is still one publish call per id, so `ID_BASELINE` stays 112 and the gate is exact at 112. No other device screen's context changes: the merge reads only the device-engineering call's value.

## Red, green, make the check fail

### Red

- **`red-fix1.txt`**: `server/routes/__tests__/mdx-vault-admits-project.test.ts` against head: 5 failed, 2 passed (7).
  - The two that pass pin behaviour that must not change: the organization-wide list, and the 422 for a non-uuid.
  - The five that fail are 404 for each of the three refused projects, 503, and "the check comes before any read".
- **`red-fix2.txt`**: `client/src/concept2cure/mdx/__tests__/engineeringAnaContext.test.tsx` against head: 4 failed (4).
  - In the first case the register ("Hazards identified 6", HZ-01) and the trace (DI-03) are already on screen. The failure is that AnA's context holds neither.
  - It was run while the file held four cases, the settle case included. The other three also fail at head only because they wait for those facts. Their own properties are pinned by mutations: F2-M2 (switch), F2-M3 (leave and return) and F2-M4 (settles).
  - The settle case has since moved to its own file, with no product change in between.

### Green (`green.txt`)

One file at a time under `timeout 240`, every one exit 0:

- **Fix 1** (11 files, 166 tests):
  - the new `mdx-vault-admits-project` (7);
  - `mdx-vault-audit` and `tests/mdx-beta-surfaces-routes`;
  - `tests/rls-scoped-route-mounts-tranche2`;
  - `device-project-reads-admit-program` and `device-project-writes-admit-program`;
  - VaultSurface's client suites: `VaultSurface.noInventedRecord`, `VaultSurface.noUnbackedClaim`, `uploadedFileHasNoAuthoringState` and `useVault.qa`;
  - the v2 `vaultSurface` suite.
- **Fix 2** (28 files, 240 tests):
  - the two new files, `engineeringAnaContext` (3) and `engineeringAnaContextSettles` (1);
  - the Engineering suites (6) and `useEngineering.unavailable`;
  - `anaDrives*` (6);
  - `surfaceContext`, `surfaceContextIds` and `surfaceContextLoop`;
  - the host suites: `MdxSurfaceHost`, `deviceFeaturesReadTheProject`, `editorHandoff`, `surfaceHostFailure`, `surfaceHostRenders` and `k510IvdVariant`;
  - `ProjectMdxWorkflow` and `riskAndDesignControlsSharedMounts`;
  - both `tests/concept2cure` smoke suites.

39 files, 406 tests in all.

### Mutations (`mutation-*.txt`)

Each was applied alone and its test run alone, then the file was restored from the bytes held in memory and its sha256 checked (`restored byte for byte: yes` in each file). The product files hash the same after the run as before it. 10 of 10 are red, each on its own case.

| Id | Mutation | File | Result |
|---|---|---|---|
| V1 | the list does not ask `admitProject` | `mdx-vault.ts` | red (5 failed, 2 passed) |
| V2 | the check runs only after both halves were read | `mdx-vault.ts` | red (5 failed, 2 passed). The 404s and the 503 still came back, but both halves had been read |
| F2-M1 | the host publishes its own context on device-engineering, not the merged one | `MdxSurfaceHost.tsx` | red (3 failed) |
| F2-M2 | the merge does not check that the panels are the project in context's | `MdxSurfaceHost.tsx` | red (1 failed: project B's context carried A's 6 hazards) |
| F2-M3 | Engineering does not clear the panels' context on unmount | `engineeringPanelsContext.ts` | red (1 failed: the earlier visit's 6 hazards came back while the register read again) |
| F2-M4 | Engineering reports on every render, not on a change of content | `engineeringPanelsContext.ts` | red on `engineeringAnaContextSettles` (1 failed: 189 more host commits in 400 ms after it should have settled) |
| F2-M5 | the merge drops the trace's facts | `MdxSurfaceHost.tsx` | red (2 failed) |
| F2-M6 | the host does not pass `onPanelsContext` | `MdxSurfaceHost.tsx` | red (3 failed) |
| F2-M7 | the merge drops the register's actions | `MdxSurfaceHost.tsx` | red (1 failed) |
| F2-M8 | Engineering reports only when the project changes, not when the panels' content does | `engineeringPanelsContext.ts` | red (3 failed) |

**Why the settle case has its own file.** F2-M4 was first run against `engineeringAnaContext.test.tsx` while that file still held the settle case (`mutation-F2-M4-under-act.txt`). Under `act()` the loop is synchronous, so no timer or test timeout fired, and `timeout 240` killed the run (exit 124). That is a hang, not a failure, and CI would hang the same way.

So the case moved to `engineeringAnaContextSettles.test.tsx`. It renders through `createRoot` outside `act()`, where each pass of the loop is a scheduler task and timers run between them, so the loop is counted and reported. The other file keeps the three remaining cases, with no case duplicated.

## Gates (`gates.txt`)

All exit 0, on the final tree:

- `ci:program-ownership-single-source` and its selftest;
- `ci:sql-interpolation` and its selftest;
- `ci:undefined-css-classes`, which was also OK at head, after fix 1 and at the freeze;
- `ci:class-vocabulary`;
- `node scripts/ci/check-ana-surface-context.mjs` (`npm run ci:ana-surface-context`): 112 of 117, baseline 112 exact.

Two more checks:

- **eslint (`eslint.txt`).** Plain `npx eslint --no-ignore` on every changed and new file gives 0 errors and 10 warnings. That is head's ten on the three product files: MdxSurfaceHost 4, EngineeringSurface 5, mdx-vault 1. The new module and the three new test files carry none.
- **Type check (`typecheck.txt`).** The changed and new files, with everything they import, under the repo's options, give 0 errors (`typecheck-tsconfig.json`).

## Not done

1. **The Vault does not put a refusal into words.** A 404 or 503 from the list reaches `VaultSurface` as `error`, drawn as "Could not be read" with a retry. That is honest, but it does not say "this project isn't one this organization can see", as Engineering does through `v2/projectScopedRead.tsx`. The client was outside this change's files. F3 moves the device vault into `v2/surfaces/Vault.tsx` in any case.
2. **The artifact routes take no program.** `/vault/:artifactId`, `/versions` and `/audit` answer for any artifact of the organization, whichever project is open. That is tenant-safe (each checks the organization first) but not project-scoped. F3 item 2 ("versions and audit reads for artifact leaves, under project route access") is where that belongs.
3. **The whole-tree type check** (`typecheck:fast`) was not run here, for memory, as in F1b. The changed files and everything they import type-check (`typecheck.txt`).
4. **`DEVICE_SCREEN_ACTIONS`** still opens with "the registers and counts render from the org's live device data". On Engineering, the register and the trace are the project's. That line is shared by every device screen, so it was left alone.

## Files

- **Changed:**
  - `server/routes/mdx-vault.ts`
  - `client/src/concept2cure/mdx/MdxSurfaceHost.tsx` (the device-engineering context only)
  - `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx` (the `onPanelsContext` prop, approved by the lead)
- **New:**
  - `client/src/concept2cure/mdx/surfaces/engineeringPanelsContext.ts`
- **New tests:**
  - `server/routes/__tests__/mdx-vault-admits-project.test.ts`
  - `client/src/concept2cure/mdx/__tests__/engineeringAnaContext.test.tsx`
  - `client/src/concept2cure/mdx/__tests__/engineeringAnaContextSettles.test.tsx`
- **Evidence:**
  - `red-fix1.txt` and `red-fix2.txt`;
  - `green.txt`, `gates.txt`, `eslint.txt`, `typecheck.txt` and `typecheck-tsconfig.json`;
  - `mutation-V1.txt` and `mutation-V2.txt`;
  - `mutation-F2-M1.txt` to `mutation-F2-M8.txt`, with `mutation-F2-M4-under-act.txt`.
