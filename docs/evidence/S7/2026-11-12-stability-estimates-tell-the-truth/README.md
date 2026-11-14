# The Stability register: a recorded shelf life is judged against the study's own estimate, and an estimate follows its results

**Row:** D4 / D5 (CMC / Module 3 — engines produce the verdicts; the screens show the work) · **Package:** S7 ·
**Date:** 2026-11-12

Two things on the Stability tab that a head of CMC would rely on and should not have. Both were seen in the running
app on the demo programme (C2C-201) before anything was changed.

## What already exists

| Path | What it does today |
|---|---|
| `server/services/cmc/recorded-stability.ts` `estimateRecordedShelfLife` → `shelf-life.ts` | The ICH Q1E fit of one study's recorded results: per-attribute estimate, the overall `supportedShelfLife`, the limiting attribute |
| `POST /api/cmc/stability-studies/:id/shelf-life` | The route the register calls; it answers that fit |
| `server/services/cmc/ich-compliance-q1e.ts` | `monthsIn` (the parser of a claimed period) and `checkQ1E`, which judges the programme's claim against the PERIOD the data cover — never against the fit |
| `client/.../cmcStabilityChart.tsx` `useAutoQ1e` | Estimates every study with results when the register opens (P-122) |
| `client/.../CmcModule.tsx` `CmStability` | The register, the shelf-life evidence table, the per-study charts |

Nothing new: one pure function beside the parser it uses, one field on an existing response, one cell and one
hook changed.

## 1. The recorded shelf life stood beside an estimate that does not support it, with nothing said

The evidence table printed, on one row: **Q1E estimate 21.9 mo, limited by Assay** — and — **Recorded shelf life
24 months retest**. The recorded re-test period is longer than this study's results support, and that is what
§3.2.S.7 will print and what a signer closes the study out on. The existing ICH check does not catch it: it compares
the claim with twice the covered period (24 months from 12), and never looks at the regression.

`judgeRecordedShelfLifeClaim` (in `ich-compliance-q1e.ts`, beside `monthsIn`) decides it, and the estimate route
returns it as `recordedClaim`. The register prints the engine's sentence under the recorded shelf life:

> The recorded 24 months is longer than the 21.9 months this study's recorded results support (ICH Q1E, limited by
> Assay). A longer period rests on other supporting data or a justification, stated in the stability section.

- A claim the estimate supports gets no remark.
- A claim that states no period, or a study with no overall estimate, is said to be **not compared** — never called
  supported. Found live on the drug-product study: Assay fits at 18 months, Dissolution has two points, so the engine
  withholds an overall figure; the sentence says that rather than "could not be estimated".
- **It refuses nothing.** A sponsor may support a longer period with other batches or a justification, and the signed
  close-out stays a person's decision. The browser states a verdict it was given and derives none (RULE 2).

`01-after-the-evidence-table.png` is that table in the running app.

## 2. An estimate, its chart and its trend outlived the results they were fitted from

The register estimated each study **once** for the life of the screen. Recording a new pull point replaced the
study's row — "Longest pull" and "Within limits" moved — while the Q1E estimate, its chart, the trend assessment and a
pooled result stayed exactly as fitted from the earlier points, with nothing to say so. After an out-of-specification
pull the cell still read the old shelf life; after the third point of a new study it still read "too few points".

- Recording a result now drops that study's estimate and trend (and a pooled result that included it).
- `useAutoQ1e` asks once per study **per state of its results** (their count), so the estimate is asked for again,
  and a refusal is forgotten when the study is asked again.

## Files in another session's hold

`server/api/cmc/routes.ts` is held today by Wave B lane W4. This change adds one selected column and four lines to
one handler there (the estimate route), and says so in `COORDINATION.md`.

## Verified

- Engine: 7 cases (`recorded-claim-against-estimate.test.ts`).
- Screen: 5 new cases in `cmcStabilityChart.test.tsx`. Against the old behaviour: with the hook asking once per
  study, 2 fail (`expected 1 to be 2`; the refusal never cleared); with the sentence not rendered, 1 fails.
- **In the running app**, C2C-201: the live route answers `exceeds-estimate` for the drug-substance study,
  `not-comparable` for the drug-product long-term study and nothing for the accelerated study (no shelf life
  recorded), and the table reads as the screenshot shows.
- 468 of 468 across the 22 client suites that mount the CMC module or its stability code, with the retired-name
  ratchet; the CMC API suites pass.
- `eslint`: every touched file at trunk's warning count (the note and a map helper were extracted to
  `cmcStabilityChart.tsx` to keep it so); the retired `cm-meta` count is unchanged.
