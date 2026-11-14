# S12 biotech sweep: the Biostatistics lane's findings, re-checked on trunk and fixed (F1)

**Date:** 2026-11-13 to 2026-11-14 · **Package:** F1 · **Source:**
`docs/evidence/SPINE/S12/2026-11-09-biotech-sweep/defects.json`, positions 58–61, 63, 64, 66–69. The coordinator
routed them to this lane on 2026-11-12 (`.design/claude-convergence/COORDINATION.md`, "S12's biotech sweep").

The findings were verified on 2026-11-09. Each was re-checked on trunk (`6853cb4ce9`) before any fix, by reading the
code paths it names and the git history since. A second reader was asked to refute each verdict, but those runs
failed on the account's usage limit. So for each fix, the failing test written first is what confirms the defect
still existed.

## Status by finding

| # | Finding | On trunk | Done here |
|---|---|---|---|
| 58 | "Open in editor" / "Save as a working document" answer 503 | **Blocker already fixed** by `44f25b3fdb` (ana-biostats.ts resolver) and `098899e6ae` (the claim is a number where it is set). The two sibling resolvers the finding named still returned any truthy claim | Both now read the organization through the one resolver every route uses (`server/types/auth-request.ts` `resolveOrgId`). The `authoringHandoff.ts` half (a 503 `PROJECT_ACCESS_UNAVAILABLE` reads "could not confirm", though nothing was written) is the editor lane's and is handed back, not changed |
| 59 | Three worked examples fail to size | **Sizing already fixed** by `e965a16772` and `d22d9a51f9`. Refusal sentences still ran together (`said.join(' ')`) | Each normalizer sentence ends in a full stop before joining |
| 60 | The sample size document states a stale effect size | **Open** | Server: a binary design with both rates is sized, judged and documented on their difference, and a stated effect size that disagrees is named in a warning. Client: "Delta rate" follows the rates and is read-only while both are given |
| 61 | An unsized design shows another design's sizing, or the oncology example rated "Adequate" | **Open** | A "not sized" engine state: nothing is computed or written in the design's name. The document pane shows what the design lacks (`DesignGapList`), the inputs are inert, and Open in editor and Save are disabled. Choosing a worked example or a sized design clears it |
| 63 | Protocol DOCX/PDF export carries raw Markdown | **Open** | Not done in this batch (S3 + S1, medium). Next |
| 64 | Interim Analysis Plan states a planned interim with Interims = 0 | **Partly fixed** by `cf6b0293f3`, which still drafted one look at 50% with a boundary table | With no interim analysis recorded, the plan says none is planned and prints no timing, boundary, stopping rule or interim statistician. This reverses `cf6b0293f3`'s "drawn for one" choice on purpose |
| 66 | Schedule of assessments keeps stale warnings after a tick | **Open** | Not done in this batch (S3, small). Next |
| 67 | Calculator results show raw JSON, float noise and broken labels | **Open** | Cells print to fifteen significant digits. A column of rows (the group-sequential `perLook`) becomes its own table, each row led by its scenario's drift. Labels come from the shared `humanizeKey` instead of a local copy |
| 68 | "Insert into document" creates a new document on every click | **Open** | Not done in this batch. Next |
| 69 | The defensibility form sends stale hidden fields | **Open** (re-checked by hand: its reader hit the usage limit) | Rates are sent only for a binary endpoint, the effect size only for any other |

## What already exists (RULE 3)

Every change extends a file that already does the job. No screen, route file, service, table, mount or AnA tool is
added.

- `server/services/ana-biostats/input-normalizer.ts`: the validator in front of every biostatistics route. It already
  derived the effect size from the rates when none was stated (`deriveEffectSize`).
- `server/services/ana-biostats/computation-engine.ts` `binaryRates`: the engine already sized binary designs on the
  two rates. Unchanged.
- `server/services/ana-biostats/document-generator.ts` `generateInterimAnalysisPlan`: the SAP and DSMB-charter
  generators in the same file already say "no interim efficacy analysis" for zero.
- `server/types/auth-request.ts` `resolveOrgId`: the canonical organization resolver, with about 390 callers.
- `client/src/concept2cure/v2/surfaces/biostatEngineResult.tsx` `DesignGapList`: the gap list the design assessment
  already renders, reused in the not-sized pane.
- `shared/biostat-vocabulary.ts` `humanizeKey`: the shared label helper. `BiostatWorkbench.tsx`'s local `humanize`
  was a second copy and is now an alias of it.
- `client/src/concept2cure/v2/engineResultHtml.ts` `engineResultCellText`: the one cell formatter for the screen and
  the filed section (also read by `PvCockpit.tsx`).

## Evidence

Each finding has a `NN-red.txt` and a `NN-green.txt`. Every red was run against the trunk code before the fix, with
the test as committed.

| # | Test | Red | Green |
|---|---|---|---|
| 58 | `server/routes/__tests__/biostat-org-claim-is-a-number.test.ts` | 5 of 9 fail: '7' written as text; "seven" and -1 reach the service | 9 pass |
| 59 | `biostatServerEngine.test.tsx` "keeps two of the normalizer's sentences two sentences" | fails | passes |
| 60 | `server/services/ana-biostats/__tests__/binary-effect-is-the-rates-difference.test.ts` | 5 of 8 fail: effect size 0.47 kept, 0.21999999999999997, equal rates admitted, the document states 0.47 | 8 pass |
| 60 | `biostatServerEngine.test.tsx` "a binary design's delta is the difference between its rates" | 2 fail | 2 pass |
| 61 | `biostatBridge.test.tsx` "a design the engine cannot size yet" | 4 fail: no not-sized state | 4 pass |
| 64 | `interim-plan-boundaries-are-computed.test.ts` | 2 fail (Interims 0, and no count) | 24 pass |
| 67 | `tests/concept2cure/engine-result-filing.test.ts`, `workbenchNestedTables.test.tsx` | 4 fail | 5 pass |
| 69 | `workbenchHazardRatioLabel.test.tsx` "the assessment request carries only the fields shown for its endpoint" | 2 fail | 2 pass |

Suites run after the changes:
- Server: `server/services/ana-biostats`, `biostatistics-bridge` and `tests/services/ana-biostats.test.ts` with the
  biostat route tests, 34 files and 551 tests; every biostat route test, 13 files and 171 tests.
- Client: every Biostatistics, workbench and statistical test plus the filing test, 29 files and 411 tests; the PV
  cockpit, 5 tests.
- `node scripts/ci/check-eslint-warning-ratchet.mjs --since origin/concept2cure-v2`: no file changed its warning count.

Changed expectations in existing tests, each for the intended output:
- `workbenchNestedTables.test.tsx` and `biostatWorkbench.test.tsx` pinned the local label copy ("Survival Curve",
  "Oc Table", "Power At Prior Mean", "Stopped Early"). They now read the shared helper's labels ("Survival curve",
  "OC table", "Power at prior mean", "Stopped early").
- One cell pinned `String(0.5333333333333334)`. It now reads the fifteen-digit `0.533333333333333`.
- `interim-plan-boundaries-are-computed.test.ts` pinned the one-look table drawn for a design with no interim
  (`['±2.96', '±1.97']`). That assertion was the defect, and it was removed.

## Opened in the running app and used (RULE 4)

The walk is filed with the rail change, `docs/evidence/F1/2026-11-14-biostat-rail-above-cmc/walk.txt` and
`screenshots/`, from the same dev-server session (2026-11-14, dev login, org 2):

- **60:** Delta rate reads 0.47 with rates 0.08/0.55, then 0.22 after the treatment rate is set to 0.30, read-only.
  The Sample Size Rationale states "Effect size | 0.22" and 0.47 nowhere (`biostat-delta-1440.png`).
- **64:** with Interims 0, the Interim Analysis Plan says "No interim efficacy analysis is planned". It has no 50%, no
  ± boundary and no Stopping Rules section (`biostat-interim-none-1440.png`).
- **67:** the group-sequential calculator renders 117 table cells, none of them JSON and none with binary noise. It
  shows a "Characteristics · Per look" table led by drift, and "Type I error" (`calc-gs-per-look-1440.png`). The
  per-look table is nine columns wide, so at 1440 px its last column sits beyond the edge of a container that
  scrolls sideways.
- **61** was not walked. No design in this container's database has an assessment the engine cannot size, and none
  was invented for the walk. The component test drives the real surface through both of the sweep's variants.

## Not done here, recorded

- **63, 66, 68:** open. They are this lane's next work, in that order of size: 66 (small), 68 (small), 63 (medium,
  two packages).
- **58's client half:** `authoringHandoff.ts` maps a 503 `PROJECT_ACCESS_UNAVAILABLE` to "could not confirm whether
  the document was saved", although the server says nothing was changed. That file is the editor lane's, so it is
  handed back through COORDINATION.md.
- **biostatPlatform.ts:** a request with no organization still answers 500 through `serverError` rather than 403.
  It now refuses before any service call. The status mapping is a separate change across 44 handlers.
