# An elemental impurity recorded in ppm, with its daily dose on the same row, was "not assessed"

**Row:** D4 (CMC / Module 3 — engines produce the verdicts) · **Package:** S7 (engine, register), F1 (the composed
sentence) · P-113 Tier A, ICH Q3D · **Date:** 2026-11-12

## What already exists

| Path | What it does today |
|---|---|
| `server/services/cmc/impurity-assessment.ts` `assessAsElementalImpurity` | ICH Q3D(R2) over a recorded impurity row: element, route, permitted daily exposure (PDE), verdict |
| same file, `levelAsPpm`, `parseDoseMg` | The concentration reader and the maximum-daily-dose parser the ICH M7 branch already uses to compare a concentration through the dose |
| `GET /api/cmc/impurity-profiles/assessment` → `client/.../cmcRegisterEngines.tsx` | The register's "Against the guideline" column (P-122 item 4, `e30adf066`) |
| `server/services/module3Composer.ts` | The same verdict in §3.2.S.3.2 / §3.2.P.5.5 |

Nothing new. The conversion's two halves were already in the file, and the M7 branch a few functions down already
used them together.

## The defect, as seen in the running app

The demo programme's own Palladium row — **3 ppm, maximum daily dose 15 mg, oral** — read:

> Not assessed: A daily exposure in µg/day is not recorded for Palladium, so it cannot be compared to its PDE. A Q3D
> permitted daily exposure is a daily amount, so a level recorded in "ppm" cannot be compared to it without the
> product's daily dose.

The daily dose was three columns along on the same row. The engine took only a µg/day figure; on any other unit it
named a missing dose without looking for one. Elemental results are routinely reported in ppm (µg/g), so this was
the common case, and it left the one elemental row a reviewer would look for unassessed in the register and
"not assessable" in the composed section.

## The change

ICH Q3D §7 converts a concentration to an exposure with the daily amount: **µg/g × g/day = µg/day**.

- A level in ppm, ppb or % with a readable maximum daily dose is converted and compared to the PDE:
  3 µg/g × 0.015 g/day = **0.045 µg/day** against Palladium's oral PDE of 100 µg/day.
- The result carries `exposureBasis`, which says how the figure was derived and that it is **this material's
  contribution**: the PDE is for the drug product as a whole, and the contributions of every component are summed.
  One component being within the PDE is not the product being within it, and neither the screen nor the filed
  sentence lets it read that way.
- A concentration with **no** daily dose is still refused — now for that reason (`MDD_MISSING`, "No maximum daily
  dose is recorded"), and an unreadable dose (`2 mg/kg`) as `MDD_UNPARSEABLE`. Nothing is guessed.
- A level recorded in µg/day is untouched: same figure, no derivation note, no dose needed.

## Verified

- Red first: 6 of the 8 new cases failed on the old engine (`expected a Q3D assessment`;
  `'LEVEL_UNIT_NOT_CONVERTIBLE'` where `'MDD_MISSING'` is the truth). Green: 34 of 34, and 203 of 203 across the
  impurity, M7, write-through-mapper and register-engine suites.
- **In the running app**, C2C-201: the live route answers `observedMicrogramsPerDay: 0.045`, `withinLimit: true`
  with its `exposureBasis`, and all six of the demo's impurities are now assessed (it was five). The register row
  (`02-after-the-row.png`) reads: "Q3D Class 2B: 0.045 of 100 µg/day oral PDE · within · this material’s
  contribution, from its concentration and daily dose".
- `eslint`: `impurity-assessment.ts` 8 warnings, as trunk; `cmcRegisterEngines.tsx` clean.
