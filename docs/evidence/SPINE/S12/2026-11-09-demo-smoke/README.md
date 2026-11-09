# Demo smoke walk, and Biostatistics no longer opens on a record with no design

**Package:** S12 (`Biostatistics.tsx` is in its paths). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Why:** a
client demo at 20:00 UTC on 2026-11-09. The walk visits each place a demo visits and records every failed API
response, page error, console error and visible error line.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The design list | `server/services/biostatistics-bridge/bridge-service.ts` `listBridgeDesigns` | Lists every study record of the program, newest first. A record with no design metadata gets 0% readiness and **no checks** | — |
| The assessment | the same file, `assessDesign`; GET `/api/biostat-bridge/designs/:id/assessment` | Answers 404 for such a record: it has no design to assess | — |
| The arrival choice | `surfaces/Biostatistics.tsx`, the auto-load effect | Opened the first row on arrival | Skip a record with no design. When the newest record had none, the page led with "Couldn't assess the design · Couldn't find that item" |

## What changed

- **The arrival choice.** Biostatistics opens on the first row that has readiness checks, which only a real design
  has (`design-adapter.ts` `statisticalReadiness` always returns at least 10).
  - With no real design, nothing is opened and the worked example stays.
  - A person can still choose any row.
- On the live API, the two records of C2C-101 are:
  - `C2C-101-201-WALK`: 0 checks, assessment 404;
  - `sd_66e9…`: 11 checks, assessment 200.

## Red first

- `__tests__/biostatBridge.test.tsx` gains "opens on the project's first design, never on a record with no design to
  assess".
- **Red.** On trunk it fails, and the other 16 pass (`biostat-red.log`).
- **Green.** With the change, all 8 Biostatistics suites pass: 167 cases (`biostat.log`).
- Lint is unchanged on the changed file (4 warnings before and after).

## The walk

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) visits these places at 1440 light, on C2C-101:
- Home, Projects, Project home;
- a document in the one editor;
- Vault, Submission Center, Tasks, Communication;
- CMC, Biostatistics, Risk-based monitoring, Quality, Reporting & analytics;
- Study & Protocol Design.

**First run.** 13 of 14 were clean. Biostatistics showed one 404, a console error and two error lines, as above.

**After the change.** All 14 are clean: no failed API response, page error, console error or error line, and no
sideways scroll. Biostatistics opens on "[Demo · Biotech] C2C-101-201 — Phase 2 dose-ranging study", at 91%
readiness, sized by the engine (`screenshots/biostatistics.png`).

**This walk ran on this container's local database.** The walk-made records it shows ("D2 objective walk …" in
Recents, "D3-4/S12 walk: …" in the design list) exist only there, not in a hosted environment.
