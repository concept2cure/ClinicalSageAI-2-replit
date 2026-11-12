# L1: CMC tells the truth (GA-DEMO-01, GA-DEMO-02, GA-DEMO-03)

Plan package F1. Lane key L1-cmc-truth. Written 2026-11-10, repaired 2026-11-12 on the tree merged through 31e66ac55.
Nothing is committed here; the lead commits.

## What already exists

- `client/src/concept2cure/v2/surfaces/CmcModule.tsx`, `CmStability`: the Stability tab. It counts out-of-limit results, shows the warning banner, each study's results and the shelf-life evidence line.
- `client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts`, `readStabilityResults` and `stabilityResultForm`: they read the recorded series and record the "Within specification" flag. The form always writes the flag.
- `client/src/concept2cure/v2/surfaces/cmcRegisters.tsx`, `CmQcTesting`: the QC testing register. It is mounted in the Specifications tab (`CmcModule.tsx`, `<CmQcTesting />` after the method library). It printed the recorded disposition.
- `server/services/cmc/batch-release-evidence.ts`: what a batch release is signed over. It set `passed` from the recorded `pass_fail_status` alone.
- `server/services/cmc/recorded-stability.ts`, `parseAcceptanceCriterion` and `parseNumeric`: the one criterion parser and number reader (used by §3.2.S.7 and the Q1E engine). This lane reuses them and does not change them.
- `server/services/module3Composer.ts`, `qcResultVerdict` (§3.2.S.4.4 / §3.2.P.5.4) and sections `3.1` and `3.3`.
- `scripts/demo/launch-demo/packs/biotech-work-content.mjs`, `BIOTECH_SM_CMC`: C2C-201's stability and QC results. DS-2502-R2's "pass" at 97.4 % is pinned on purpose for the S7 phase-4 fixture.
- Trunk `aef73a9d1` (2026-11-10 12:41, "Demo stability results carry their condition and reading") already records `withinSpecification` on every C2C-201 stability result, with exactly one `false` (total impurities 0.61 % at 6 months accelerated).

## Zero duplication after the merges

- `git log --since=2026-11-10` was read for each lane file.
- `biotech-work-content.mjs`: trunk `aef73a9d1` did what the lane did to the stability flags. The lane's copy is withdrawn; the file equals HEAD. The lane keeps only its test, `scripts/demo/launch-demo/cmc-demo-stability-flags.test.mjs`, which now pins trunk's flags (4/4 pass).
- `CmcModule.tsx`, `cmcRegisters.tsx`: trunk changed other regions (tabs in one row, the "Next:" guide line, the change-control split, the Q1E chart). The lane's edits sit in `CmStability` and the QC register's Disposition column only.
- `batch-release-evidence.ts`, `module3Composer.ts`: no trunk commit since 2026-11-10.

## What was wrong

- GA-DEMO-01: `!withinSpecification` read a missing flag as out of specification. A study recorded without the flag showed every result as OOS (14 of 14 for C2C-201's data in the rehearsal database).
- GA-DEMO-02: DS-2502-R2 is recorded as a pass at 97.4 % against 98.0 - 102.0 %. Release trusted the recorded word, so the batch could be signed as released, and the QC register said "pass".
- GA-DEMO-03: §3.1 read `name` across the substance and the product records, so it could say "The drug substance is C2C-201 tablets". §3.3 had the same fault.

## What changed

- `CmcModule.tsx`: `stabilityConformance()`. Only an explicit "no" is OOS; a missing flag reads "not assessed" in the count line, the study's results button, the result chip (quiet tone, not the error tone), the per-study evidence chip (counts only results assessed within; quiet tone unless all are) and the shelf-life evidence line.
- `batch-release-evidence.ts`: `recordedResultVerdict()` compares the recorded value with the recorded criterion using the existing parser; limits are inclusive. A recorded pass ("pass" or "passed") whose value is outside has `contradicted: true` and `passed: false`. An approved or conditional release is refused with a reason naming the sample (`contradictedPassRefusal`, a separate helper so `evaluateRecordedRelease` gains no complexity warning). Rejection is still allowed.
- `module3Composer.ts`: `qcResultVerdict` delegates to `recordedResultVerdict` (the stored `specifications`, then the flat `acceptanceCriteria` and `specificationLimit`), so release and dossier cannot disagree. §3.1 and §3.3 read the substance name from the substance record and the dosage form from the product record: "The drug substance is C2C-201. The drug product, C2C-201 tablets, is formulated as a …".
- `cmcRegisters.tsx`: the Disposition column shows "pass, contradicted by its result" in the error tone when the server sends `conformance: 'outside'` on a recorded "pass" or "passed" (the same two words release reads). The count line then says "N contradicted" and does not count it as a pass. With no server verdict, the recorded disposition shows as recorded. Nothing the register showed was removed.
- Tests: `client/src/concept2cure/v2/__tests__/cmcStabilityAndQcTruth.test.tsx`, `server/services/__tests__/module3Composer.structural-naming.test.ts`, `server/services/__tests__/module3Composer.qc-verdict.test.ts`, `scripts/demo/launch-demo/cmc-demo-stability-flags.test.mjs` (new, beside their modules); `server/services/cmc/__tests__/batch-release-evidence.test.ts` (extended); `batch-release-fingerprint.test.ts` (the new field in its fixture).

## Verifier defects, and what the repair did

- V-L1-01 (GA-DEMO-02 not closed): accepted. GA-DEMO-02 is **partly fixed** and stays open. The release refusal and the dossier are fixed; the QC register and the batch register's Eligible column cannot show the contradiction until the server sends it (see "Not fixed here"). Walked today: Eligible reads "Yes" for C2C201-DS-2502 and Release is enabled (`shots/L1-batches-1440.png`, `-390.png`).
- V-L1-02 (boundary): test "a result exactly at a limit is within it" pins 98.0 and 102.0 against "98.0 - 102.0 %", 0.5 against "NMT 0.5 %" and 80 against "NLT 80 %". Mutations M10, M11, M12 (each limit made exclusive) are caught.
- V-L1-03 (chips): the shelf-life test asserts the unflagged study's chip reads "0/2", carries `tone-dim` and not `tone-ok`; the result-chip test asserts `tone-dim`, not `tone-err`. M15 and M16 are caught.
- V-L1-04 (aliases): a PGlite row recorded "passed" over an out-of-criterion value reads contradicted (M13 caught); `module3Composer.qc-verdict.test.ts` covers the flat `acceptanceCriteria` and `specificationLimit` keys (M14 caught); `cmcRegisters` reads "passed" as a pass, like the server (M17 caught; red in `red-repair-V04.txt`).
- V-L1-05 (navigation): corrected below. The CMC page has nine tabs in one row; Stability is a tab, and the QC testing register is in the Specifications tab. There is no "Study records" toggle.
- V-L1-06 (complexity): the refusal message moved into `contradictedPassRefusal`. `node scripts/ci/check-pushed-lint-warnings.mjs --base HEAD` lists no lane file gaining a warning; `module3Composer.ts` goes 19 to 18.

## Proof

- Red first: `red-01-02-client.txt` ("3 outside limits", no contradiction), `red-01-seed-flags.txt` (unflagged pack), `red-02-release-evidence.txt` (batch evaluated "released"), `red-03-composer-naming.txt` ("C2C-201 tablets"), `red-repair-V04.txt` (the register read only "pass").
- Green, 2026-11-12 on the merged tree: 5 lane vitest files, 41 of 41; the seed test 4 of 4.
- Mutations (`mutations.txt`), re-run 2026-11-12 00:20 on the current files: 17 of 17 caught, each file restored and its sha256 checked.
- Every test that imports a changed module (`affected-tests.txt`): vitest 64 files, 1583 tests, all pass, including the S7 phase-4 fixture; node --test 5 files, 71 tests, all pass. Vitest reports one unhandled error from `anaDrivesWave5.test.tsx` in `cmcRegisterEngines.tsx:88` (not a lane file); it occurs with the lane's client files swapped back to HEAD too (`preexisting-wave5-unhandled-at-HEAD.txt`).
- Gates: no lane file gains an ESLint warning; `npm run ci:undefined-css-classes` passes; `cmcRegisters.tsx` is 98,624 bytes. `CmcModule.tsx` (197,431) and `module3Composer.ts` (171,460) were already over 100,000 bytes at HEAD (195,860 and 171,400); the lane adds about 1.6 kB and 60 bytes.
- Typecheck (`typecheck-scoped.txt`): the changed files, the lane tests and all 84 importers, in chunks because whole-set runs were killed for memory. 0 errors in lane files. Three importer tests could not be checked even alone (memory); they pass in vitest, and the lane changed no exported signature they use.
- Running app, 2026-11-12, cal on http://127.0.0.1:5240, C2C-201 › CMC / Module 3, at 1440 and 390 px (`walk-2026-11-12.json`, `shots/`). No horizontal overflow, no page errors.
  - Stability tab: "3 active studies · 0 outside limits · 14 not assessed"; results button "6 recorded · 6 not assessed"; chips "Not assessed"; evidence line "0 within acceptance criteria, 0 outside, 14 not assessed". (`L1-stability-*.png`, `L1-stability-detail-*.png`.) No result is called OOS.
  - It does not show "1 outside" because the rehearsal database was seeded at 8a65a6f3a, before trunk's flags (`aef73a9d1`). The three 409s on that page are Q1E refusing the same unconditioned data; not this lane.
  - Specifications tab › QC testing: "5 samples — 4 pass / 0 fail — 5 awaiting review"; DS-2502-R2 reads "Pass" (`L1-qc-register-*.png`). Expected until the server sends `conformance`.
  - Batch records: C2C201-DS-2502 Eligible "Yes", Release enabled (`L1-batches-*.png`). Expected until the hand-off lands; the running server is also the old code, so the release refusal is not live there yet.

## Not fixed here

- GA-DEMO-02, QC register: `GET /api/cmc/qc-testing` in `server/api/cmc/routes.ts` (not a lane file) must add `conformance: recordedResultVerdict(row.testResults, [row.specifications])` to each row. The client half is done and tested. Owner: holder of routes.ts (CMC session S12) or the lead.
- GA-DEMO-02, Eligible column: `GET` batch records (`batchRecordRoutes.ts`, not a lane file) should send release eligibility computed with `readRecordedReleaseTests` and `evaluateRecordedRelease`, and `CmcModule`'s `eligible()` then reads it. Today Eligible means "no open deviations"; the server refuses a contradicted release only when it is tried. Owner: holder of the batch record routes / the lead.
- GA-DEMO-01, rehearsal data: the gademo database needs a fresh seed (from a tree at or after `aef73a9d1`) to show "1 outside limits". Owner: the lead.
- `cmcRegisterEngines.tsx:88` throws when the impurity assessment answer is not a list (seen in a test). Not a lane file. Owner: CMC session S12.

## Questions for the founder

- Stability says "not assessed" for a result recorded without its within-limits flag rather than guess. Should the server compute that verdict from the result and its specification instead, the way §3.2.S.7 does?
