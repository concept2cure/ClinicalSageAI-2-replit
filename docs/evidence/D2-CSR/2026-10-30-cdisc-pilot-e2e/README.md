# D2 / D4 — CSR end to end on the public CDISC pilot (CDISCPILOT01): run 1 blocked at derivation; after the fixes, run 2 reached the tables, narrative selection and assembly

Design: `docs/design/CSR_END_TO_END_2026-10-29.md` (decision 4: "End-to-end proofs use the public CDISC pilot ADaM data"). Launch rows: D2 (Authoring, Submission Center) and D4 (biostatistics evidence). Workstream W1. Run 1 was a measurement: the engine refused the pilot at derivation, and every defect was recorded. The defects were then fixed red first on synthetic data (D1-D9, D13-D16; see the fix sections below), and run 2 reached the tables, narrative selection and assembly. D10, D11, D12 and D17 remain open, as stated below.

**Run 2 outcome (2026-10-30, after the engine fixes): tables reached and exact; narratives partly blocked; assembly reached, incomplete.** The manifest now declares the pilot's define.xml conventions, and the engine derives the source, builds 11 tables, selects the 95 narrative subjects and assembles the leaves. Against the independent pandas oracle the engine matched **1,436 of 1,436** table cells, with 0 mismatched; one perturbed engine cell was caught. Against the published pilot CSR, the engine matched **174 of 174** cells where both use one definition. Narrative selection matched the oracle exactly (95, none missed, none extra). The narrative job composed 6 narratives and refused 89 by name, so §14.3.3 was not written. The 89 are subjects whose withdrawal for an AE ADSL records only per subject; the pilot never recorded which event led to it (D17, below). Assembly produced 8 leaves and 3,633 pages in 28.2 s. Its status is incomplete because the sponsor documents for 16.1.x and 16.3 were not supplied. Defects fixed: D1–D9 and D13–D16. Not fixed: D10–D12 and D17 (see [Run 2](#run-2-2026-10-30-after-the-engine-fixes)).

**Run 1 outcome: blocked.** The product's ADaM reader decodes every one of the pilot's 8,691,583 cells exactly. The derivation to `concept2cure.csr-source.v1` and the narrative selection then refuse the pilot, failing closed with typed codes. So `buildCSRTables`, narrative composition and assembly were **not reached**, and no engine table cell exists to compare. One refusal cannot be cleared without inventing data: ADAE `AEACN` is blank on every treatment-emergent row, and the pilot never collected it. The independent oracle was still run in full. Its expected cells (625 under the engine's own definitions) are ready for the run that follows the fixes. Separately, the oracle reproduces 1,825 of 1,837 published pilot CSR cells.

## Data and attribution

Data: **CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01** (updated pilot submission package 900172), Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>. Its terms of use say the data may not be modified or altered, may not be distributed without attribution to CDISC or for a fee, and may not be used to compete with CDISC. CDISC provides it "as is".

Consequently:
- **No pilot data, row or extract is in this repository.** The files are downloaded by `scripts/cre/fetch-cdisc-pilot-adam.mjs` into a directory outside it. The script refuses a directory inside the repository.
- The files in this folder hold counts, timings, refusal codes and row paths (for example `ADAE[1].AEACN`), never a data value.
- The published-CSR comparison quotes only the aggregate cells that disagree, with their table numbers.

The study is xanomeline TTS against placebo in mild to moderate Alzheimer's disease, with three arms: Placebo, Xanomeline Low Dose and Xanomeline High Dose. It has 254 subjects.

Published outputs used (same repository, same package):
- `updated-pilot-submission-package/900172/m5/53-clin-stud-rep/535-rep-effic-safety-stud/5351-stud-rep-contr/cdiscpilot01/cdiscpilot01.pdf`. This is the pilot CSR: 492 pages, "FINAL CSR, 27 June 2006", with §14 tables, SHA-256 `0cab016c76abb3dcaef31110611c95dbd9cd00df083b35e6d28fd69fca0d842d`.
- `…/cdiscpilot01/narratives.txt`: three narratives, all of them deaths. SHA-256 `8248002a576cfa2efc1ab08b3ecd2f4f9673df1919b02c0a68c6e1fd07b5fb8b`.

The CSR was written in 2006 against the original pilot data. The datasets are the updated package, re-dated to 2012–2015. Where the two disagree, it is recorded below as a data-version difference, not an engine defect.

## What already exists

These were searched by name: ADaM, XPT, `readAdamDataset`, `deriveCsrSourceFromAdam`, `csr-adam-bundle`, `selectNarrativeSubjects`, `buildCSRTables`, `assembleCsr`, `cdisc`, `pilot`, `CDISCPILOT01`, `xanomeline`, `fetch-` in `scripts/`, `server/`, `shared/` and `docs/evidence/`. `git log --all --diff-filter=D` was also run on `*pilot*` and `*cdisc*`. No earlier CDISC-pilot fetcher, fixture or run exists. Slices 6 and 7 both record the pilot as "not reachable from this session (HTTP 403)".

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| ADaM reader | `server/services/csr/adam-dataset-reader.ts` `readAdamDataset` (slice 6) | Decodes Dataset-JSON and SAS XPORT v5 (IBM floats, SAS missing values). | Holds every row as a JS object, with no streaming (see D15). |
| ADaM bundle contract | `shared/csr-adam-bundle.ts` `CsrAdamBundleSchema`, `CsrEfficacyResultsSchema` | Names ADSL, ADAE, ADEX, ADLB, ADVS, ADEG, ADCM and ADMH by Vault document and SHA-256, plus an arm map, `randomizedFlag` and AESI. | Has one ADLB slot and no variable map, and the efficacy file is mandatory (D4, D10). |
| Derivation | `server/services/csr/adam-source-derivation.ts`, `adam-rows.ts`, `adam-safety-domains.ts` | Derives `csr-source.v1` and fails closed with `CSR_ADAM_*` codes. | Accepts only ADaMIG 1.1-style names (`EOSSTT`, `DCSREAS`, `ONTRTFL`, ADEX `TRTDURD`) and event-level `AEACN` (D1, D2, D5, D9). |
| Narrative selection, facts, composition | `narrative-subject-selection.ts`, `narrative-subject-facts.ts`, `narrative-compose.ts`, `csr-narrative-job.ts` (slice 7) | Applies the E3 §12.3.2 rule over ADSL and ADAE, then fact-only template prose. | Reads AE discontinuation only from `DCSREAS`/`DCTREAS` and `AEACN` (D8). |
| Tables | `server/services/csr-tabulation-builders.ts` `buildCSRTables` | Builds 13 tables. | Not reached on the pilot. |
| Assembly | `server/services/csr/csr-assembly.ts` `assembleCsr` (slice 8) | Body, §14 and §16.2 leaves, with a structural check. | Not reached on the pilot. |
| Synthetic end-to-end | `docs/evidence/D2-CSR/2026-10-29-slice8-assembly-export/run-end-to-end-synthetic.mts` | The same chain on the invented LMN-201-shaped set. | No real data. |

Added by this step: `scripts/cre/fetch-cdisc-pilot-adam.mjs` (86 lines), which downloads and pins the files. Nothing like it existed. The harness and oracle are scratch files and are not committed (see Commands).

## Commands

```
# 1. Fetch and verify (pinned SHA-256 per file; prints the CDISC attribution and terms)
node scripts/cre/fetch-cdisc-pilot-adam.mjs <dir outside the repo>             # fetch-green.txt
#    red: a pin altered by one hex digit -> CDISC_PILOT_HASH_MISMATCH, exit 1    # fetch-red-hash-mismatch.txt
#    red: a target inside the repository -> CDISC_PILOT_INSIDE_REPOSITORY, exit 2 # fetch-red-inside-repo.txt

# 2-3. Product code over the pilot (scratch harness; calls the services directly, no DB, no Vault)
NODE_OPTIONS="--expose-gc --max-old-space-size=8192" npx tsx <scratch>/pilot-out/run-pilot.mts <dir> <scratch>/pilot-out   # pilot-run.json

# 4. Independent oracle (python3 -I, pandas 3.1.0 read_sas; a venv outside the data directory)
python -I <scratch>/oracle/reader_check.py <dir> <scratch>/pilot-out/reader-dump    # reader-vs-pandas.json
python -I <scratch>/oracle/tables.py <dir> <csr.txt> <scratch>/pilot-out/oracle.json  # oracle-vs-published.json
```

`<scratch>` is `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/18f73405-4fbd-5074-ba66-7d0cbd687728/scratchpad`. The harness and the oracle are kept there because they embed figures transcribed from the CDISC CSR, and the reader dump is pilot data. `csr.txt` is `pdftotext -layout cdiscpilot01.pdf`.

Pinned SHA-256 values (also in `fetch-green.txt`):
- adsl `c5139f87…`
- adae `b8678e70…`
- adlbc `b9f6b510…`
- adlbh `de568850…`
- advs `28233c8e…`
- adtte `68513fc4…`
- adqsadas `ac3fa121…`
- adqscibc `16e7118f…`
- adqsnpix `90cf4389…`
- define.xml `7e6d580e…`

The fetch took 6.8 s wall time for 90.4 MB, and a second fetch was byte-identical.

## Step 2: the bundle the run used

- **Arms.** TRT01P `Placebo` maps to PBO, `Xanomeline Low Dose` to XANLOW and `Xanomeline High Dose` to XANHIGH. ADSL has TRT01A equal to TRT01P for all 254 subjects.
- **Populations**, as `define.xml` defines them:
  - `ITTFL` is "Y if ARMCD ne ' '", meaning randomized. It is declared as `randomizedFlag: 'ITTFL'` because the pilot has no RANDFL.
  - `SAFFL` is "Y if ITTFL='Y' and TRTSDT ne missing".
  - `EFFFL` is SAFFL plus at least one post-baseline ADAS-Cog and CIBIC+.
  - `COMP24FL` is completers of Week 24.
  - Counts: ITT 254, Safety 254, Efficacy 234, COMP24 118. End of study (DCDECOD = COMPLETED) is 110.
- **Labs.** The bundle names one ADLB, so ADLBC was named. Supplying it is refused (D4). The view run combined ADLBC and ADLBH rows under the name ADLB: 74,264 + 49,932 = 124,196 rows, with identical 46-column sets and no value changed.
- **Efficacy: import and verify, found and transcribed.** The source is `cdiscpilot01.pdf` Table 14-3.01, "Primary Endpoint Analysis: ADAS Cog (11) - Change from Baseline to Week 24 - LOCF" (Efficacy population; CSR §11.4.1 p. 28). The transcription has six rows:
  - mean change per arm: 2.5 (SD 5.80), n=79; 2.0 (5.55), n=81; 1.5 (4.26), n=74
  - ANCOVA LS-mean differences: low − placebo −0.5 (SE 0.82), 95% CI −2.1 to 1.1, p=0.569; high − placebo −1.0 (0.84), −2.7 to 0.7, p=0.233; high − low −0.5 (0.84), −2.2 to 1.1, p=0.520

  It parses under `CsrEfficacyResultsSchema`. The **dose-response p = 0.245 cannot be expressed** in that contract (D10). Nothing was computed. The oracle verified only the arm n's against ADSL EFFFL (79 / 81 / 74, matched), and it did not recompute any efficacy mean.
- **AESI** was not declared. The pilot's "dermatologic events" category (`ADAE.CQ01NAM`) is a CSR §12.3.3 analysis category, not a protocol AESI list. Declaring it would add 85 subjects to the narrative set: 180 instead of 95.

## Step 3: what the product did (times and memory from `pilot-run.json`)

| Step | Result | Time | Heap before → after | Max RSS |
|---|---|---|---|---|
| read adsl.xpt (254 rows × 48) | ok | 17 ms | 42.3 → 47.3 MiB | 224 MiB |
| read adae.xpt (1,191 × 55) | ok | 30 ms | 43.4 → 50.0 | 225 |
| read adlbc.xpt (74,264 × 46, 34.2 MB) | ok | 2,598 ms | 48.1 → 318.4 | 526 |
| read adlbh.xpt (49,932 × 46, 23.0 MB) | ok | 1,613 ms | 313.7 → 502.8 | 694 |
| read advs.xpt (32,139 × 34) | ok | 743 ms | 492.7 → 569.2 | 754 |
| read adtte.xpt (254 × 26) | ok | 3 ms | 558.7 → 560.9 | 756 |
| read adqsadas.xpt (12,463 × 40) | ok | 297 ms | 559.2 → 594.0 | 767 |
| read adqscibc.xpt (730 × 36) | ok | 13 ms | 584.2 → 593.3 | 769 |
| read adqsnpix.xpt (31,140 × 41) | ok | 840 ms | 585.6 → 653.8 | 845 |
| efficacy file, `CsrEfficacyResultsSchema` | ok (6 results) | 2 ms | | |
| manifest, `CsrAdamBundleSchema` | ok | 1 ms | | |
| **A1** derive ADSL, ADAE, ADLB=ADLBC, ADVS, as published | **refused** `CSR_ADAM_DATASET_MISMATCH` "The file supplied as ADLB is the ADLBC dataset." | 1 ms | | |
| **A2** derive ADSL, ADAE, as published | **refused** `CSR_ADAM_VARIABLE_MISSING` at `ADSL.EOSSTT` | 0 ms | | |
| **A3** narrative selection, as published | **refused** `CSR_ADAM_VALUE_MISSING` at `ADAE[1].AEACN` | 2 ms | | |
| **B1** derive with an ADSL view that adds EOSSTT/DCSREAS from DCDECOD, ADLB=ADLBC+ADLBH, ADVS | **refused** `CSR_ADAM_VALUE_MISSING` at `ADAE[1].AEACN` | 49 ms | | 943 |
| **B2** narrative selection on that view | **refused** `CSR_ADAM_VALUE_MISSING` at `ADAE[1].AEACN` | 1 ms | | |
| `buildCSRTables`, narrative facts/compose, §14.3.3, `assembleCsr` (§14, §16.2, body with contents, structural check), pages per leaf | **not reached** | — | — | — |

Memory: reading the nine files grew the heap by about 610 MiB (42 → 654 MiB), and max RSS reached 845 MiB. ADLBC alone, a 34 MB file, cost about 270 MiB of heap. The 943 MiB peak includes the harness writing the oracle dump.

The B1 view **adds** two ADSL variables and alters none:
- `EOSSTT` = COMPLETED where `DCDECOD` = COMPLETED, else DISCONTINUED. `define.xml` defines `DISCONFL` as "Y if DCREASCD ^= 'Completed'".
- `DCSREAS` = `DCDECOD` for discontinued subjects.

No view can clear AEACN: the variable exists and is blank. Filling it would alter CDISC data and would also fabricate a value.

What stands between the pilot and the tables. This census of every treatment-emergent ADAE row and BDS dataset applies the engine's own rules (`pilot-run.json` step B3):
- 1,126 treatment-emergent rows: **AEACN blank on all 1,126**. The SDTM `AE.AEACN` is also blank on all 1,191 records.
- **AEREL `REMOTE` on 156** treatment-emergent rows. It is not in the engine's related or unrelated sets.
- ADLB and ADVS have **no ONTRTFL**.
- ADLB ANRIND uses `N`/`H`/`L` (and blank), not `NORMAL`/`HIGH`/`LOW`.
- ADVS: **759** subject × PARAM pairs carry more than one ABLFL baseline, one for each of three positions (ATPT).

## Step 4: the oracle

**Reader, cell by cell** (`reader-vs-pandas.json`). 8,691,583 cells over the nine datasets: **8,691,583 matched, 0 mismatched**, with rows and column names equal in every dataset. 291,653 numeric zeros came back from pandas 3.1.0 as 16⁻⁶⁵ (5.4e-79). That is a pandas XPORT defect: an IBM float with a zero fraction is 0, and the product decodes it so. The oracle maps exactly that value to 0. It was then shown failing: a dump with one ADSL AGE cell perturbed by 1 gave 8,691,582 matched and 1 mismatched, naming row 5 and column AGE. That file was not kept, because it holds a data value.

**Engine tables against the oracle:** 0 cells compared, because the engine produced none. The oracle holds **625 expected cells** under the engine's published definitions, ready for the post-fix run:
- §10.1 disposition
- §11.1 populations
- §11.2 demographics (n, mean (SD) age, sex, weight, BMI)
- §12.2 overall, by SOC, and PT ≥ 5%
- §12.3 deaths and SAEs
- §12.1 exposure (from ADSL TRTDUR/AVGDD)
- §12.4 shifts (baseline to the End of Treatment visit), 388 cells

**Narrative subject set (E3 §12.3.2),** computed by the oracle:
- deaths 3: DTHFL, and AESDTH = Y, all three non-serious per AESER, as the CSR states
- SAEs 3: all treatment-emergent
- discontinuation for an AE 92: DSRAEFL / DCDECOD ADVERSE EVENT
- union **95** (Placebo 10, Low 45, High 40)

The published `narratives.txt` gives 3 narratives (the deaths only). That is the 2006 report's scope, not a defect of either side.

**Oracle against the published CSR TLFs** (`oracle-vs-published.json`): **1,837 cells, 1,825 matched, 12 mismatched.**

| Published table | Cells | Mismatched | Classification |
|---|---|---|---|
| 14-1.01 populations (ITT, Safety, Efficacy, Complete Week 24, Complete Study × 4) | 20 | 0 | — |
| 14-1.02 early termination before Week 24 (oracle: DCDECOD and COMP24FL = N) | 16 | 0 | — |
| 14-1.02 against end-of-study DCDECOD (the engine's basis) | 16 | 6 | **definition difference**: AE 40 vs 39 (High) and 92 vs 91; Death 2 vs 1 (Placebo) and 3 vs 2; Lost to follow-up 1 vs 0 (Low) and 2 vs 1. The published table counts terminations before Week 24; the engine's `dispositionBasis: 'end-of-study'` counts the end of study, and labels its row "Completed study". Both are correct for their own basis. |
| 14-2.01 demographics (age, weight, BMI, height, MMSE, education, disease duration: n, mean, SD, median, min, max; AGEGR1, SEX, BMIBLGR1, DURDSGR1) | 208 | 0 | All matched with SAS half-up rounding. With binary rounding, 5 cells were 0.1 lower (see D13). |
| 14-2.01 race | 8 | 4 | **data-version difference**: the 2006 CSR lists Hispanic as a race. The updated ADSL records RACE and ETHNIC separately. Published Caucasian + Hispanic = 75+3 / 72+6 / 71+3 = 78 / 78 / 74, which equals the oracle's WHITE. |
| 14-4.01 average daily dose, safety population | 15 | 0 | — |
| 14-5.01 TEAE subjects n by SOC and PT (9 names truncated in print, matched by unique prefix) | 762 | 0 | — |
| 14-5.01 TEAE event counts [AEs] | 762 | 0 | — |
| 14-5.02 TEAE SAEs (0 / 1 / 2) | 3 | 0 | — |
| §12.3.1 deaths (2 / 1 / 0) | 3 | 0 | — |
| 14-7.02 SYSBP change at end of treatment (3 positions × arm: n, mean, SD) | 24 | 2 | **data-version or windowing difference**: High dose, lying, n 81 vs 82 and SD 14.56 vs 14.48. Mean −5.8 matches. Definition used: the last scheduled visit 2–24 per subject and position, the CSR's footnote. The updated ADVS "End of Treatment" visit is a different derivation, and with it all 24 cells differ. |

The headline figures match: 254 randomized; 86 / 84 / 84.

## Defects (run 1, step 5; status after run 2 in the run-2 section)

Severity: **B** blocks the pilot, **H** high, **M** medium, **L** low. "Latent" means hidden behind an earlier refusal and found by the census or by code reading.

| ID | What | Where | Evidence | Class | Sev |
|---|---|---|---|---|---|
| D1 | The derivation requires ADaMIG 1.1 `EOSSTT`. The pilot (ADaM model 2.1 era) records disposition in `DCDECOD`/`DCREASCD`/`DISCONFL`, and the bundle has no variable map. | `adam-source-derivation.ts:39`, `populationFlags` :61 | A2 `CSR_ADAM_VARIABLE_MISSING ADSL.EOSSTT` | engine/contract gap (the fail-closed refusal is right; no mapping exists) | B |
| D2 | Event-level `AEACN` is required on every treatment-emergent row. The pilot never collected it: all 1,126 blank, and SDTM AE.AEACN blank on all 1,191. There is no route to subject-level AE discontinuation (ADSL `DSRAEFL` / DCDECOD ADVERSE EVENT, 92 subjects), which the pilot records and which published Table 14-1.02 reports. | `adam-source-derivation.ts` `discontinuationOf`; `narrative-subject-selection.ts:58-60` | A3, B1, B2 at `ADAE[1].AEACN`; census 1,126/1,126 | engine definition gap. It cannot be cleared without fabricating data. | B |
| D3 | AEREL `REMOTE` (156 TEAE rows) is unmapped, and the manifest cannot declare the SAP's causality mapping. The pilot CRF codes relationship as None / Remote / Possible / Probable. | `adam-source-derivation.ts` `RELATED`/`UNRELATED`, `relationOf` | census B3 | engine/contract gap | B (latent) |
| D4 | There is one ADLB slot, and the dataset name must equal `ADLB`. The pilot's ADLBC + ADLBH split (common practice) cannot be named, and supplying ADLBC is refused. | `shared/csr-adam-bundle.ts` `datasets`; `adam-rows.ts` `expectDataset` | A1 `CSR_ADAM_DATASET_MISMATCH` | engine/contract gap | H |
| D5 | BDS on-treatment requires `ONTRTFL`. The pilot marks the last on-treatment value by `AVISIT` "End of Treatment" (and `AENTMTFL` in ADLB) and has no ONTRTFL. | `adam-rows.ts:83` `seriesOf` | census: ADLB and ADVS have no ONTRTFL | engine gap | B (latent) |
| D6 | ANRIND must be `NORMAL`/`HIGH`/`LOW`. The pilot uses `N`/`H`/`L`, and there is no codelist map. | `adam-safety-domains.ts:44` `RANGE` | census: values N, H, L, blank | contract / CT-version gap | M (latent) |
| D7 | Vital-sign series are keyed by PARAM only, so a parameter measured at several timepoints/positions (ATPT/ATPTN) has several baselines and is refused (`BASELINE_AMBIGUOUS`) rather than summarised per position. The published 14-7.02 summarises per position. | `adam-rows.ts` `seriesOf` (key `[subject, parameter]`) | 759 subject × PARAM pairs with more than one ABLFL | engine defect | M (latent) |
| D8 | Narrative selection takes AE withdrawal from ADSL only through `DCSREAS`/`DCTREAS`. A dataset that records it as `DCDECOD`/`DSRAEFL`, as the pilot does, is read as "no" for every subject. If D2 were relaxed, selection on the pilot as published would return 6 subjects (deaths and SAEs) instead of 95, silently missing 89, against the module's own "never narrows silently". | `narrative-subject-selection.ts:75-80`; `narrative-subject-facts.ts:182` | oracle: 92 AE-discontinuation subjects, union 95; deaths ∪ SAEs = 6 | engine defect (silent narrowing) | H (latent) |
| D9 | Exposure is read only from ADEX `PARAMCD = TRTDURD`. The pilot has no ADEX; ADSL `TRTDUR`, `AVGDD` and `CUMDOSE` hold it (published 14-4.01), so §12.1 would be absent and the mean daily dose "—". | `adam-safety-domains.ts` `readExposure` | 14-4.01 15/15 oracle cells from ADSL | engine gap | M |
| D10 | The efficacy contract has no armless result, so the published dose-response p (0.245) cannot be imported. `efficacyResults` is also mandatory in the bundle, so a run "without efficacy" cannot be expressed. | `shared/csr-source-input.ts:34-38`; `shared/csr-adam-bundle.ts` `efficacyResults` | transcription of Table 14-3.01: 6 of 7 results expressible | contract gap | M |
| D11 | Populations carry randomized, safety, ITT, completed and per-protocol. The pilot's Efficacy population (`EFFFL`, 234) and Week-24 completers (`COMP24FL`, 118) cannot be declared (`mitt` is never set from ADaM), so the published 14-1.01 rows "Efficacy" and "Complete Week 24" cannot be produced. | `adam-source-derivation.ts` `populationFlags`, `subjectOf` | 14-1.01: 8 of 20 cells have no engine row | presentation / contract gap | M |
| D12 | The §11.2 demographics table prints n, mean (SD) age, sex, weight and BMI only. There is no median, min/max, age category, race, ethnicity or Total column, so of the 208 published 14-2.01 cells most have no engine counterpart. | `csr-tabulation-builders.ts` `buildDemographicsTable` | 14-2.01 comparison | presentation gap | L |
| D13 | Rounding: the engine formats with JS `toFixed`, which rounds the binary value (`(1.005).toFixed(2)` is `1.00`). SAS outputs round half up on the decimal. The oracle saw 5 published 14-2.01 cells 0.1 lower under binary rounding and 0 under half-up, so engine means can differ from SAS TLFs in the last place. | `csr-tabulation-builders.ts` `meanSd`, `incidence` | oracle first run 5 mismatches, then 0 | presentation | L |
| D14 | The pure derivation modules open a database pool on import (`adam-source-derivation` → `source-access` → `authoring/authoring-program-access` → db). The harness logged "[database] Initializing PostgreSQL connection pool". | `server/services/csr/source-access.ts:8` | `pilot-run.txt` (scratch) first lines | tooling | L |
| D15 | Memory: the reader holds every row as an object, at about 8× file size (a 34 MB XPT cost about 270 MiB heap). This pilot of 254 subjects reached 845 MiB RSS on reading. A merged ADLB here would be 57 MB, against the 64 MiB per-file cap (`vault-source-input.ts:14`). A study ten times this size would not fit. | `adam-dataset-reader.ts` `readXpt` | step table above | scale | M |

Not defects:
- the 14-1.02 basis difference (definition)
- race and SYSBP (data version, explained above)
- pandas' 16⁻⁶⁵ zeros (an oracle-library defect, handled)
- the published 3 narratives against E3's 95 (report scope)

## Not done, and why

- Tables, narratives (selected, composed or refused), assembly pages per leaf and the structural check were not measured on real data, because every route to them is refused at derivation (D1 and D2). D2 cannot be lifted by any view without fabricating `AEACN`. A run that reaches them needs the engine changes for D1–D5 and D8, which belong to a later step.
- Efficacy was imported and verified only, as decision 2 requires. No ADAS-Cog figure was computed.
- No PGlite or Vault run. The services were called directly, with no database write and no data in a committed test.

## Run 2 (2026-10-30, after the engine fixes)

### What already exists (for the fixes)

Searched before any change: `EOSSTT`, `DCDECOD`, `DSRAEFL`, `AEACN`, `ledToDiscontinuation`, `AEREL`, `ANRIND`, `ONTRTFL`, `ATPT`, `TRTDUR`, `AVGDD`, `toFixed`, `CsrSourceInputError`, `ADLB` and `conventions` across `server/`, `shared/` and `client/src`. `git log --all --diff-filter=D` was also run on `*adam*`, `*conventions*` and `*variable-map*`. No variable map, codelist decode or declared ADaM convention exists anywhere. The only reader of these names is the slice-6 derivation. Each fix below **extends the existing module** named; nothing was rebuilt beside it.

| Piece | Path | Before | Now |
|---|---|---|---|
| Bundle contract | `shared/csr-adam-bundle.ts` | ADaMIG 1.1 names only, and one ADLB slot | Optional `conventions` (each one declared, never guessed), plus `ADLBC` and `ADLBH` slots |
| Source contract | `shared/csr-source-input.ts` | AE withdrawal per event only; efficacy keyed by endpoint and arm | `aeDiscontinuationBasis` 'event' or 'subject', with `disposition.discontinuedForAdverseEvent` validated complete and safety-only; efficacy keyed by comparator too |
| Derivation | `server/services/csr/adam-source-derivation.ts`, `adam-rows.ts`, `adam-safety-domains.ts` | Refuses the pilot (EOSSTT, AEACN) | Reads the declared conventions; per-timepoint vital signs; ADSL exposure; ADLBC + ADLBH |
| Narrative selection and facts | `narrative-subject-selection.ts`, `narrative-subject-facts.ts` | AE withdrawal from DCSREAS/DCTREAS only (D8) | Also DCDECOD and the declared ADSL flag |
| Tables | `server/services/csr-tabulation-builders.ts` | `toFixed` (binary rounding); AE withdrawal rows count events only | `roundHalfUp` (`server/services/csr-figure-format.ts`); subject-level AE withdrawal rows, labelled "(subject-level)" |
| Error type | `server/services/csr/csr-source-error.ts` (new, 8 lines; `source-access.ts` re-exports it) | The pure modules reached the DB pool through source-access | The pure modules import the error alone |
| Reader | `server/services/csr/adam-dataset-reader.ts` | One dictionary-mode object per row | Rows copied from one all-columns template; character values shared per variable |

### The manifest's declarations for the pilot (from its define.xml)

```
conventions: {
  disposition: 'DCDECOD',              // ADSL.DCDECOD "DS.DSDECOD where DSCAT='DISPOSITION EVENT'"; codelist DISCCD
  aeDiscontinuationFlag: 'DSRAEFL',    // ADSL.DSRAEFL "Y if DCREASCD='Adverse Event'"; ADAE.AEACN never collected
  causality: { REMOTE: 'not related' },// codelist AECAUS NONE/POSSIBLE/PROBABLE/REMOTE; see the decision below
  rangeIndicator: { N: 'NORMAL', H: 'HIGH', L: 'LOW' },   // codelist LNH
  lastOnTreatment: { variable: 'AVISIT', value: 'End of Treatment' },
  exposure: { durationDays: 'TRTDUR', averageDailyDose: { variable: 'AVGDD', unit: 'mg' } }  // "TRTEDT-TRTSDT+1"; "CUMDOSE/TRTDUR"
}
datasets: ADSL, ADAE, ADLBC, ADLBH, ADVS
```

With no conventions the engine refuses exactly as in run 1 (`pilot-run-v2.json` steps "A": `ADSL.EOSSTT`, `ADAE[1].AEACN`), so fail-closed behaviour is unchanged for an undeclared study.

### Decisions on definition differences (per define.xml and the ADaM IG; the engine changed only where it was wrong)

- **Disposition basis (14-1.02).** The published table counts terminations before Week 24. The engine counts end-of-study DCDECOD under `dispositionBasis: 'end-of-study'` and labels its row "Completed study". define.xml defines DCDECOD as the disposition event, so the engine is right for its basis. **No engine change.** The 6 differing published cells remain a definition difference.
- **Race (14-2.01).** The 2006 CSR folds ETHNIC into race; the updated ADSL records them separately. This is a data-version difference, and the engine table does not print race (D12). **No change.**
- **Vital signs at end of treatment (14-7.02).** The published CSR footnote uses the last scheduled visit 2–24. The updated ADVS carries a derived `AVISIT = End of Treatment` record, which the manifest declares as the last on-treatment record. The engine reads the dataset's own derivation, as the ADaM IG intends for analysis-ready data. **No change**, and the published SYSBP cells are not compared, because the two definitions differ.
- **Causality (D3).** The pilot CRF codes None / Remote / Possible / Probable. Neither the CSR nor define.xml states which of these count as related. The engine therefore refuses REMOTE until the manifest declares it. For this run the manifest classes it as **not related**, a common SAP convention. This is the manifest author's declaration, recorded and bound by the manifest digest, and it is not the engine's choice. The published CSR has no treatment-related row to check it against.
- **Lab and vital-sign parameters per arm.** The engine's §12.4 table lists every arm for each parameter, showing 0 assessed where an arm has no record. The first run-2 oracle omitted those arms (30 cells). The oracle was corrected to the engine's table definition. That was an oracle gap, not an engine defect.

### Fixed (red with a SYNTHETIC fixture first, then green)

Fixture: `server/services/csr/__tests__/support/adam-legacy-synthetic.ts`. It has 8 invented subjects in the pilot's ADaM 2.1 shape; no pilot row was copied. Tests: `adam-declared-conventions.test.ts` (20), `csr-table-rounding.test.ts` (3) and `adam-derivation-import-graph.test.ts` (7). Red output: `fix-red.txt` (26 failed, plus the D16 red). Green output: `fix-green.txt`.

| ID | Red (before the fix) | Change | Green |
|---|---|---|---|
| D1 | `ADSL.EOSSTT` VARIABLE_MISSING on a DCDECOD study | `conventions.disposition: 'DCDECOD'`. COMPLETED → completed; DEATH, LOST TO FOLLOW-UP and SCREEN FAILURE map as before; any other term → discontinued, with the term as the reason. A blank value is refused. | Statuses per subject equal the fixture's. Undeclared still requires EOSSTT. |
| D2 | `ADAE[1].AEACN` VALUE_MISSING with AEACN never collected | `conventions.aeDiscontinuationFlag`. AEACN is no longer required. Events carry no `ledToDiscontinuation`. The source declares `aeDiscontinuationBasis: 'subject'`, and the §12.2/§12.3 rows read "Discontinued for an AE (subject-level)" from ADSL. The contract refuses a mixed basis, a missing flag, or a flagged subject outside safety. | 1 (25.0%) / 1 (25.0%), never 0. Undeclared still refuses a blank AEACN. |
| D3 | REMOTE VALUE_UNMAPPED with no way to declare it | `conventions.causality` | Declared REMOTE is counted as declared; undeclared, it is still refused. |
| D4 | No ADLBC/ADLBH slot | `ADLBC` and `ADLBH` bundle slots; shifts are read over every lab dataset; a parameter in two datasets is refused (`CSR_ADAM_LAB_PARAMETER_DUPLICATED`) | Shifts from both datasets |
| D5 | ONTRTFL VARIABLE_MISSING | `conventions.lastOnTreatment` names the record. Two such records with different values are refused (`LAST_VALUE_AMBIGUOUS`). | The last values are the End of Treatment record's |
| D6 | N/H/L VALUE_UNMAPPED | `conventions.rangeIndicator` decode | Undeclared, still refused |
| D7 | `BASELINE_AMBIGUOUS` for two positions | A parameter whose baselines differ by ATPT for some subject is summarised per timepoint, labelled "PARAM, ATPT". Two baselines at one timepoint are still refused. | Lying SYSBP 131.5 (1.3) → 121.5 (1.3) |
| D8 | Selection returned 1 of 3 subjects, silently missing both DCDECOD ADVERSE EVENT withdrawals | Withdrawal is read from DCSREAS, DCTREAS **and DCDECOD**, plus the declared flag. The facts reader names DCDECOD as the reason's source. | All 3 selected; the reason is sourced to `ADSL[2].DCDECOD` |
| D9 | No exposure without ADEX | `conventions.exposure` reads ADSL duration and average daily dose for every safety subject. A blank value → `EXPOSURE_INCOMPLETE`; a declaration beside an ADEX → `CONVENTION_CONFLICT`. | 54.0 mg, 54.5 days, 0.60 PY |
| D13 | Mean 60.05 printed "60.0" | `roundHalfUp` (half away from zero on the value read to 12 significant digits), used for every engine-computed figure. Imported efficacy figures print as imported. | "60.1"; 1.005 → "1.01" |
| D14 | Import graph from 5 pure modules reached 11 modules under `server/db` | `csr-source-error.ts`; `source-access.ts` re-exports it | 7/7. A tsx import of derivation, selection and facts no longer logs the pool. |
| D15 | Synthetic 60,000 × 44 XPT: **239 MiB** held, 95 bytes per cell (`reader-memory-synthetic.txt`, reader at HEAD) | Shared row shape, and character values interned per variable (at most 4,096 per variable) | **41 MiB**, 16 bytes per cell. Pilot: reading all 9 files grew the heap by **95 MiB** (was 610), and max RSS was **384 MiB** (was 845). Reader against pandas is still **8,691,583 / 8,691,583** (`reader-vs-pandas-v2.json`). |
| D16 (new, found by run 2) | `CSR_ADAM_SOURCE_INVALID` "Duplicate efficacy endpoint result": high vs placebo and high vs low share an endpoint and an arm | The efficacy key includes `comparatorArmId` | The 6 transcribed results import; a true duplicate is still refused |

The D15 memory figures are measured, not asserted by a unit test, because heap figures are not stable enough for CI. `measure-reader-memory.mts` reproduces them from invented data.

### Run 2 measurements (`pilot-run-v2.json`; counts, times and memory only)

| Step | Result | Time | Heap after | Max RSS |
|---|---|---|---|---|
| read 9 XPT files (as run 1) | ok | 3.85 s total | 99.5 → 194.6 MiB | 384 MiB |
| derive, no conventions | refused `ADSL.EOSSTT` (as run 1) | 2 ms | | |
| narrative selection, no conventions | refused `ADAE[1].AEACN` (as run 1) | 2 ms | | |
| derive, conventions declared | ok: 254 participants, 1,126 TEAEs, 204 lab-shift summaries (ADLBC + ADLBH), 2,483 vital-sign records, exposure for 3 arms | 258 ms | 203.8 | 391 |
| `buildCSRTables` | 11 tables: disposition, populations, demographics, primary efficacy (6 imported results), exposure, AE overall, by SOC (23), PT ≥ 5% (21), deaths/SAEs, lab shifts (210 rows), vital signs (33 rows) | 44 ms | | |
| narrative selection | 95 subjects: death 3, serious 3, discontinuation 92, AESI 0 (none declared) | 3 ms | | |
| narrative job (template prose, no model) | **incomplete**: 6 composed, 89 refused by name; §14.3.3 and §12.3.2 not written | 27 ms | | |
| fact gate on the composed narratives | 6 of 6 reconcile against 811 facts | 2 ms | | |
| `assembleCsr` | **incomplete**: 8 leaves, 0 unresolved references, 49 links checked; 15 appendices missing (9 of them blocking); one structural finding | 28.2 s | 242.8 | 400 |

Pages per leaf: body 4, §14 TFLs 22, 16.2.1 5, 16.2.2 1, 16.2.3 1, 16.2.4 10, 16.2.7 74, and 16.2.8 3,516 (74,264 ADLBC rows). That is 3,633 pages. Every listing verified against its source rows (`ok: true`).

Notes on the assembly result:
- The body's only section is a one-line title written by the harness, because the pilot has no study prose. So the body's bookmarks reach 3 levels, not 4, and the structural check reports `BOOKMARK_DEPTH`. That is the gate working on a near-empty body, not an assembly defect.
- The 16.1.x, 16.2.6 and 16.3 sponsor documents were not supplied, and are listed as missing.
- §16.2.8 takes one laboratory dataset, so ADLBC was given (see D4 below).

Narrative QC on the 6 composed narratives. Every one lists these as missing, honestly, rather than filled in:
- `deathDate` and `deathCause`: ADSL has no DTHDT or DTHCAUS (3 deaths)
- `event.action`: AEACN was not collected
- `exposureDays`: there is no ADEX
- `concomitantMedications` and `medicalHistory`: no ADCM or ADMH was supplied

### Run 2 oracle

- **Engine against oracle** (`engine-vs-oracle-v2.json`). `python -I <scratch>/oracle2/tables2.py` computes every cell from `pandas.read_sas` under the engine's definitions and the declarations above, written out independently, then compares it with the engine's tables:
  - **1,436 cells, 1,436 matched, 0 mismatched.** By table: disposition 28, populations 16, demographics 15, exposure 12, AE overall 18, by SOC 69, PT 84, deaths/SAEs 12, lab shifts 1,050, vital signs 132.
  - Shown failing: one engine cell perturbed by 1 gave 1,435 / 1 (aeBySOC).
  - Primary efficacy is imported and is not compared.
- **Engine against the published CSR** (`engine-vs-published.json`), where both use one definition:
  - **174 cells, 174 matched.** 14-1.01 ITT, Safety and Complete Study: 12. 14-2.01 age n, mean age, weight and BMI, sex: 18. 14-4.01 mean daily dose: 3. 14-5.01 subjects by SOC and by PT (the PTs in the ≥ 5% table): 135. 14-5.02 SAEs: 3. Deaths: 3.
  - Shown failing: the same perturbation gave 173 / 1.
- **Narrative selection**: the engine's 95 equals the oracle's 95, with 0 missed and 0 extra.
- The run-1 oracle against the published CSR is unchanged: 1,837 cells, 1,825 matched, 12 explained.

### Not fixed, and why

- **D17 (new, found by run 2). 89 narratives refused.** The pilot records withdrawal for an AE only per subject (DSRAEFL), and no ADAE row records which event led to it. The composer (`narrative-compose.ts` `refusalReason`) refuses such a subject by name: "no ADAE event records the study treatment as withdrawn (AEACN)". The QC list names all 89, and §14.3.3 is not written, so nothing reads as complete. A narrative that lists the subject's TEAEs without asserting which one caused the withdrawal is a content decision for E3 §12.3.2, and it belongs to the narrative composer, which this step left alone (the D5 narration lane). The data cannot supply the missing link.
- **D10. Armless efficacy result and optional efficacy.** The dose-response p = 0.245 still cannot be imported, and a run without efficacy cannot be expressed. Both are contract changes to the hand-built source and every efficacy consumer. They state nothing false: the imported table shows the 6 results the SAP file holds.
- **D11. EFFFL and COMP24FL populations.** This is a presentation gap that misstates nothing: the rows are absent, not wrong. Mapping EFFFL onto the contract's `mitt` would mislabel it.
- **D12. Demographics depth** (median, range, categories, race, Total). This is a presentation gap that misstates nothing.
- **D4, partly.** The §16.2.8 listing (`csr-listings.ts`) takes one laboratory dataset, so ADLBH is derived into §12.4 but not listed. The production assembly path supplies no laboratory dataset today (`csr-assembly-source.ts`).
- **D9, narrative facts.** `exposureDays` in a narrative is still read from ADEX only, so it is listed as missing for QC. The table's exposure comes from ADSL.
- **D15, partly.** Memory per cell fell about 6×, but the reader still holds every row, and the 64 MiB per-file cap is unchanged. Splitting labs into ADLBC and ADLBH (D4) keeps the pilot's files under it.

### Commands (run 2)

```
npx vitest run server/services/csr/__tests__/adam-declared-conventions.test.ts \
  server/services/csr/__tests__/csr-table-rounding.test.ts server/services/csr/__tests__/adam-derivation-import-graph.test.ts   # fix-red.txt / fix-green.txt
NODE_OPTIONS=--expose-gc npx tsx docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e/measure-reader-memory.mts <reader.ts>        # reader-memory-synthetic.txt
NODE_OPTIONS="--expose-gc --max-old-space-size=8192" npx tsx <scratch>/pilot-out/run-pilot-v2.mts <dir> <scratch>/pilot-out  # pilot-run-v2.json
python -I <scratch>/oracle/reader_check.py <dir> <dump>                                                                         # reader-vs-pandas-v2.json
python -I <scratch>/oracle2/tables2.py <dir> <scratch>/pilot-out/engine-tables.json <out>                                       # engine-vs-oracle-v2.json
python -I <scratch>/oracle2/engine_vs_published.py <scratch>/pilot-out/engine-tables.json <published cells> <out>             # engine-vs-published.json
```

The run-2 harness and oracles stay in the scratch directory, as in run 1. They hold the manifest transcription and the engine's pilot-derived figures, and no pilot value is in the repository.

Attribution: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01, Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>, used under its terms (unmodified, attributed, not for a fee, not to compete with CDISC).

## Review (2026-10-30, adversarial pass)

- **Fetch guard defect, fixed.** The inside-repository test was `path.resolve(dir).startsWith(repoRoot + path.sep)`, so the repository root itself passed. Red: `node scripts/cre/fetch-cdisc-pilot-adam.mjs <repo root>` downloaded the pilot files into the repository root (the reviewer deleted them at once; nothing was staged). Fix: `insideRepository()` compares `path.relative` over real paths (symlinks resolved, missing tails allowed) and is checked inside `fetchCdiscPilot` too, not only on the command line. Green: the root, the root with a trailing slash, a path under it, `root/../<root name>` and a symlink into it all exit 2 with `CDISC_PILOT_INSIDE_REPOSITORY`; the scratch directory and a sibling directory whose name only starts with the root's are outside.
- **Re-verification.** The engine was re-run from the current tree (derive, `buildCSRTables`, narrative selection); its tables are identical to the run-2 dump. A second oracle, written by the reviewer from `pandas.read_sas` alone (no product code, no import of the run-2 oracle), checked 35 cells the reviewer chose across disposition, demographics, exposure, AE overall, SOC, PT, deaths/SAEs, ADLBC and ADLBH shifts, vital signs, and the narrative set: **35 of 35 matched**. Shown failing: one perturbed vital-sign cell and one dropped narrative subject gave 32 / 3.
- The six imported efficacy figures were re-read against Table 14-3.01 of the published CSR: all match; none is computed.

## Files

- `fetch-green.txt`: the attribution, ten files, their sizes and SHA-256, exit 0 and 6.8 s.
- `fetch-red-hash-mismatch.txt` and `fetch-red-inside-repo.txt`: the two refusals.
- `pilot-run.json`: every step, with time, heap, RSS, refusal codes and row paths. No values.
- `reader-vs-pandas.json`: per-dataset cell counts.
- Run 2: `pilot-run-v2.json`, `engine-vs-oracle-v2.json`, `engine-vs-published.json`, `reader-vs-pandas-v2.json`, `reader-memory-synthetic.txt` and `measure-reader-memory.mts` (synthetic data only), `fix-red.txt`, `fix-green.txt`.
- `oracle-vs-published.json`: counts by table, the 12 mismatching cells, the narrative-set sizes and the latent-issue counts.
- D18: `d18-pilot.json` (counts, times, memory, the independent leaf check and the red at HEAD), `d18-fix-red.txt`, `d18-fix-green.txt`, `contract-rules-red.txt`, `contract-rules-green.txt`.
- §14.3.3 by reference: `ref-red.txt`, `ref-green.txt`, `ref-mutation-facts-digest.txt`, `ref-mutation-walk.txt`, `ref-scale-1500.json`, `ref-scale-5000.json`, `ref-measure.mts` (synthetic data only).

## Run 3 (2026-10-30): D10, D11 and D12 fixed

Launch rows D2 and D4, workstream W1. This run fixes three defects that run 2 left open: D10 (efficacy contract), D11 (declared populations) and D12 (demographics depth). Each fix is opt-in, so a source or manifest that uses none of them tabulates byte-identically to before, and existing receipts still verify. That claim is tested, not asserted.

### What already exists

These were searched before any change: `buildDemographicsTable`, `buildAnalysisPopulationsTable`, `buildEfficacyTable`, `mitt`, `EFFFL`, `COMP24FL`, `AGEGR1`, `HEIGHTBL`, `median`, `Total`, `efficacyResults`, `completeDomains`, `armId`, `dose`, `not supplied` and `CsrEfficacyResultSchema`, across `server/`, `shared/` and `client/src`. `git log --all --diff-filter=D` was also run on `*demograph*` and `*efficacy*`. No second demographics, populations or efficacy table exists anywhere. Every change below **extends the module named**.

| Piece | Path | Before | Now |
|---|---|---|---|
| Source contract | `shared/csr-source-input.ts` | Efficacy needs ≥ 1 result, each with an arm. Populations are fixed. Demographics carry age, sex, race, ethnicity, weight and BMI. | Adds an armless result (`method` and `population` required, no comparator) and `efficacyStatus: 'not-supplied'`. Adds `additionalPopulations` with per-arm counts, checked against participant flags. Adds the `demographicsPresentation: 'descriptive'` fields: `height`, `ageGroup` with declared `ageGroups`, and declared `baselineCharacteristics`. Every new field is optional and validated. |
| Bundle contract | `shared/csr-adam-bundle.ts` | `efficacyResults` is mandatory. | `efficacyResults` is optional. Adds `conventions.populations` (flag + define.xml label) and `conventions.demographics` (descriptive, plus declared characteristics). |
| Derivation | `server/services/csr/adam-source-derivation.ts`, new `adam-baseline.ts` (93 lines) | No route for any of these. | Reads the declared flags and characteristics, AGEGR1 when ADSL has it, and HEIGHTBL. Refuses: a population flag already reported as randomized, safety, ITT or per-protocol (`CONVENTION_CONFLICT`); a missing column; a non-Y/N flag; a value outside its declared categories; and a manifest and efficacy file that disagree (`EFFICACY_MISSING` / `EFFICACY_UNDECLARED`). |
| Bundle load | `server/services/csr/adam-bundle-load.ts` | Always loads the efficacy file. | Loads it only when the manifest names one. |
| Tables | `server/services/csr-tabulation-builders.ts`, new `csr/csr-demographics-descriptive.ts` (84 lines), `csr/csr-efficacy-table.ts` (the §11.4 builder moved out unchanged, so the builder file stays under its line limit) | Compact §11.2, no Total column. The populations table lists only fixed rows. An empty §11.4 shows "No data" with blank cells. | **§11.2 (descriptive):** n, mean (SD), median and min/max, with a Total column. Categories cover age group, sex, race, ethnicity and the declared characteristics. A subject without a value counts on a "Not recorded" row. **§11.1:** each declared population is a row under its label. **§11.4:** shows Method and Population columns only when a result states them. When efficacy is declared not supplied, it shows one row: "Efficacy results not supplied", with "—" in the other cells. |

Design choices, stated so a reviewer can check them:
- **Age groups** come only from ADSL AGEGR1, in AGEGR1N order. Without AGEGR1N, they are ordered by the youngest age in each group. With no AGEGR1, there are no age-group rows, and no band is ever invented.
- **Declared categories** print in their declared order. A declared category with no subject is a recorded 0.
- **Precision:** means, medians, min and max print to one place, SDs to two, and percentages to one. All are rounded half up.
- **An armless result** prints "—" in the Arm column. Its method and population are the SAP's text, imported unchanged, and nothing is computed.

### Red, then green (SYNTHETIC)

Tests:
- `server/services/csr/__tests__/csr-populations-demographics-efficacy.test.ts`: 17 tests, run against the run-2 legacy synthetic ADSL plus invented columns (AGEGR1/N, HEIGHTBL, RACE, ETHNIC, EFFFL, COMP24FL and two invented characteristics) and `source-input-fixture.ts`.
- `csr-table-byte-identity.test.ts`: 1 test.

No pilot value is used in either. Red output is in `d10-d12-fix-red.txt`: 15 failed, 3 passed. Two of the three passed vacuously before the change, because the strict schema rejected the unknown `populations` key and nothing could reach mITT. The third is the byte-identity test, which is meant to pass before the change. Green output is in `d10-d12-fix-green.txt`: 18 of 18.

**Byte identity, proved.** The digests of `buildCSRTables` output were taken at `7e4c7f479e`, before any edit, and pinned in `csr-table-byte-identity.test.ts`. They cover:
- the source fixture
- the LMN-201 seed source
- a 300-subject scale envelope
- the legacy and LMN-201 ADaM derivations, both the envelope and the tables

After the change, all 7 digests are equal. Shown failing: forcing the new Method/Population columns on unconditionally changed 5 of the 7 digests (`d10-d12-byte-identity-red.txt`). The two that did not change are the derived envelopes, which this perturbation does not touch. On the pilot itself, the run-2 manifest (no new declarations) gives the same tables digest before and after the change: `4a09d058…`.

### On the pilot (`run3-d10-d12.json`; counts only)

The manifest is run 2's, plus:
- `populations`: EFFFL "Efficacy Population Flag" and COMP24FL "Completers of Week 24 Population Flag". These are the define.xml labels, transcribed.
- `demographics`: descriptive, with MMSETOT, EDUCLVL and DURDIS (continuous) and DURDSGR1 `<12`, `>=12` and BMIBLGR1 `<25`, `25-<30`, `>=30` (categorical), each under its define.xml label.
- The efficacy file adds the armless Table 14-3.01 dose-response result: p = 0.245, with the method from the table's footnotes [1][2] and the Efficacy population (LOCF). It is transcribed, not computed.

Derivation plus tables took 225 ms. A run without the efficacy file derives, and §11.4 reads "Efficacy results not supplied".

| Comparison | Cells | Matched | Mismatched | Shown failing |
|---|---|---|---|---|
| Engine against a new independent oracle (`oracle3/tables3.py`; `pandas.read_sas` only, no product code, no run-2 oracle import): descriptive §11.2 176, §11.1 with the new rows 24, the dose-response row 3 | 203 | 203 | 0 | One demographics cell and one population cell perturbed gave 201 / 2. |
| Engine against the published CSR: **14-2.01: 208**, **14-1.01: 20**, **14-3.01 dose-response p: 1** | 229 | **229** | 0 | One SD perturbed gave 228 / 1. |
| Run-2 oracle over the run-2 manifest (regression) | 1,436 | 1,436 | 0 | — |
| Run-2 oracle over the declared manifest | 1,514 | 1,421 | 93 | Not a defect. The run-2 oracle encodes the compact §11.2 (15 cells) and the 4 fixed population rows. All 93 differences are in those two tables: the new layout and the 8 new population cells. Every other table matches. |

Published 14-2.01 is now produced in full, all 208 cells:
- age, weight, height, BMI, MMSE, years of education and duration of disease: n, mean, SD, median, min and max for 3 arms plus Total
- AGEGR1, sex, BMIBLGR1 and DURDSGR1 counts

Published 14-1.01's Efficacy and Complete Week 24 rows are produced, completing its 20 cells. The published 14-2.01 race rows (8 cells) are still not compared. They remain the data-version difference recorded in run 1, because the 2006 CSR folds ETHNIC into race. The engine prints RACE and ETHNIC separately, as the updated ADSL records them.

### Not done, and why

- Published **percentages** are not compared. The published table prints whole percentages, and the engine prints one decimal place. Only the counts are compared.
- The published **p-values for 14-2.01** (ANOVA and chi-square) are not produced. They are inferential statistics that the SAP output would supply. The engine computes none (decision 2).
- `ci:tenant-isolation` reports one finding at `server/services/vault/vault-placement.service.ts`. That file was last changed in `1371823ee0` and is untouched by this change. `ci:sql-interpolation` is OK.

### Commands (run 3)

```
npx vitest run server/services/csr/__tests__/csr-populations-demographics-efficacy.test.ts server/services/csr/__tests__/csr-table-byte-identity.test.ts   # d10-d12-fix-red.txt / -green.txt
npx tsx <scratch>/d10-12/run-pilot-v3.mts <dir> <scratch>/d10-12 base|declared|noefficacy
python -I <scratch>/oracle3/tables3.py <dir> <scratch>/d10-12/engine-tables-declared.json <out>
python -I <scratch>/oracle3/engine_vs_published3.py <scratch>/d10-12/engine-tables-declared.json <scratch>/pilot-out/oracle-pub.json <csr.txt> <out>
```

The harness and oracles stay in the scratch directory, as in runs 1 and 2. Attribution: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01, Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>.

## D17 fixed (2026-10-30): narratives for a withdrawal recorded per subject only

Product decision (taken): a subject withdrawn for an AE, where the data record the withdrawal per subject only, gets a complete narrative, not a refusal. That means a declared `aeDiscontinuationFlag` and no event-level AEACN. The narrative states the withdrawal. It lists every treatment-emergent AE with onset on or before it, each attribute taken from its row. It says plainly: "The data do not record which adverse event led to withdrawal." It never names one event as the cause. Launch rows: D2 / D4, workstream W1.

**Outcome on the pilot:** the narrative job composed **95 of 95** narratives and refused 0, against 6 composed and 89 refused in run 2. **95 of 95** reconcile with their facts under the fact gate (5,043 facts). §14.3.3 and §12.3.2 are written. All 11 tables and the 95-subject selection are **identical to run 2**. Engine against the oracle: **1,436 / 1,436**. Engine against the published CSR: **174 / 174**. One new defect was found and is not fixed: D18, below.

### What already exists

These searches ran before any change: `refusalReason`, `discontinuedForAePerAdsl`, `aeDiscontinuationFlag`, `RFENDT`, `EOSDT`, `DSRAEFL`, `led to`, `withdraw` and `causal` across `server/`, `shared/` and `client/src`. `git log --all --diff-filter=D` also ran on `*narrative*`. No narrative path for a subject-level withdrawal existed anywhere. The composer refused it (`narrative-compose.ts` `refusalReason`), and the fact gate had no rule about causal attribution. Each change below **extends the module named**; nothing was rebuilt beside it. `server/services/ana/safety-narrative.ts` (D5 lane) and `shared/authoring/csr-scientific-review.ts` were not touched.

| Piece | Path | Change |
|---|---|---|
| Bundle | `shared/csr-adam-bundle.ts` | Adds an optional `conventions.aeDiscontinuationDate`, the ADSL withdrawal date. It is declared, never guessed. (The first version fell back to ADaMIG `EOSDT` when it was not declared. The review below removed that fallback.) The change is one field. |
| Selection | `narrative-subject-selection.ts` | When the flag is declared, a flagged subject keeps every TEAE row (`TRTEMFL = Y`) as `subjectLevelWithdrawal`. TRTEMFL is then required. |
| Facts | `narrative-subject-facts.ts` | `withdrawal` is read only when no ADAE event records the withdrawal. It holds the date, sourced to `ADSL[i].RFENDT`. It holds the study day, computed from the date (`RFENDT − TRTSDT + 1`) and named as computed. It holds the TEAEs with onset on or before the withdrawal, compared by date and otherwise by study day. TEAEs with no recorded onset are listed for QC and not placed. Facts are kept only for the events listed. |
| Composer | `narrative-compose.ts` | Adds a subject sentence (when no qualifying event introduces the subject) and the withdrawal paragraph. Each listed event is one sentence: onset, severity, seriousness, relatedness and outcome. A TEAE with no recorded onset gets its own sentence. When no TEAE precedes the withdrawal, the narrative says so, and the QC list records it. The narrative is refused by name only when no withdrawal date is recorded, because then the preceding events cannot be identified. |
| Fact gate | `narrative-reconciliation.ts` | The listed TEAEs are checked like any other event: dates, days, severity, grade, death, and each one must still be named. Two new codes. `NARRATIVE_CAUSE_STATEMENT_MISSING`: the narrative must state that the data do not record which event led to withdrawal. `NARRATIVE_CAUSE_UNSOURCED`: a sentence with a withdrawal word is refused when it also has a causal phrase ("due to", "led to", "resulted in", "because", "following", …) or names an event as the "reason". Pronoun forms are caught too ("This resulted in discontinuation"). These rules apply only to a subject-level withdrawal. |

### Red, then green (SYNTHETIC)

Test: `server/services/csr/__tests__/narrative-subject-level-withdrawal.test.ts` (11 tests). Its four invented subjects cover a TEAE before withdrawal, one on the withdrawal day, one after it, one that is not treatment-emergent, one with no recorded onset, a subject with no TEAE before withdrawal, and a subject with no withdrawal date. No pilot row was used.

- Red (`d17-fix-red.txt`): 9 failed. The key one: a model rewrite reading "The subject was withdrawn due to Syncope." was **accepted as model prose** (`prose: 'model'`). The gate had no rule against it.
- Green (`d17-fix-green.txt`): 11 of 11 pass. These rewrites are refused: "withdrawn due to <event>", "<event> led to the withdrawal", "This resulted in discontinuation" and "<event> was the reason for discontinuation". In each case the template is kept and the refusal is recorded. A rewrite is also refused when it drops a listed event, adds an event dated after the withdrawal, moves the withdrawal day, or changes a severity. A connective-only rewrite passes.
- **Byte identity for sources that do not use the feature** (`d17-byte-identity.txt`). A SHA-256 was taken over every selected subject's facts, `factsDigest` and composed narrative, on the slice-7 synthetic fixture (120 and 1,000 subjects) and on the legacy fixture with event-level AEACN. The hashes are **identical before and after the change**. So a stored narrative's facts digest still matches, and a resume does not recompose. The tables are untouched: the table code was not changed, and on the pilot all 11 tables equal run 2's.
- `npx vitest run server/services/csr shared`: 120 files, **1,533 passed**. ESLint reports no warnings on the changed files. No file exceeds 1,500 lines (the largest is 267). `ci:sql-interpolation` OK. `ci:tenant-isolation`: the same single `vault-placement.service.ts` finding reported above, in a file this change does not touch. `ci:tenant-entry-points` fails on `server/routes/mdx-admin.ts` (untouched here). `tsc --noEmit -p .`: no error in any file of this change. One error at `adam-source-derivation.ts:72` belongs to the concurrent D10–D12 work in that file.

### On the pilot (`d17-pilot.json`; counts only)

The manifest adds `aeDiscontinuationDate: 'RFENDT'`. Per define.xml, ADSL.RFENDT is "Date of Discontinuation/Completion" (RFENDTC as a SAS date). Every other declaration is run 2's.

| Check | Result | Shown failing |
|---|---|---|
| Narrative job | complete: 95 selected, **95 composed, 0 refused**; §14.3.3 and §12.3.2 written | — |
| Fact gate over every composed narrative | **95 ok, 0 failed** (5,043 facts) | — |
| Independent pandas oracle (`python -I <scratch>/d17/narr_oracle.py`, `pandas.read_sas` only). For each of the 92 DSRAEFL subjects it recomputes RFENDT, the study day and the TEAEs with onset on or before RFENDT. It then checks each subject's facts and text: the withdrawal sentence, the cause statement, no causal phrase, the exact candidate set, and each listed event's sentence (term, onset day, severity, seriousness, relatedness and outcome, parsed from the text) | **1,104 checks, 1,104 matched**. 484 listed events, 484 sentences checked. | One onset day shifted in one narrative: 1,103 / 1. The cause statement replaced by "withdrawn due to <event>" in one narrative: 1,102 / 2. |
| Spot check of 10 narratives read whole against pandas (`spot10.py`): age, sex, arm, study, first dose, recorded reason, withdrawal date and day, each listed TEAE, nothing after the withdrawal, each SAE's onset; 2 of the 10 also have an SAE | **132 / 132** | One shifted day and one dropped statement: 130 / 2, naming both |
| Fact gate on the pilot, model rewrites (`gate-pilot.mts`): a "withdrawn from the study due to <event>" rewrite, a pronoun "This event resulted in discontinuation", and a connective-only rewrite, on each of the 92 | 92 / 92 refused, 92 / 92 refused, 92 / 92 accepted | — |
| Tables against run 2 | identical (11 tables, the selection) | — |
| Engine against oracle (`oracle2/tables2.py`) | **1,436 / 1,436**, 0 mismatched | as run 2 |
| Engine against the published CSR (`oracle2/engine_vs_published.py`) | **174 / 174**, 0 mismatched | as run 2 |

On the pilot, no TEAE starts after RFENDT for a withdrawn subject, every withdrawn subject has at least one TEAE before RFENDT, and no TEAE lacks an onset. Those three branches are therefore proven on the synthetic test only. Three of the six narratives composed in run 2 also carry a subject-level withdrawal (an SAE together with DSRAEFL). Their narratives now include the withdrawal paragraph. The QC list now carries `withdrawalEventN.action` for every listed event, because AEACN was not collected, and it states that rather than filling it in.

### D18 (new, found by this run): a landed §14.3.3 is not placed in the assembled CSR. Not fixed here; fixed later, see [D18 fixed](#d18-fixed-2026-10-30-the-narratives-are-their-own-1433-leaf-hash-verified).

With the narratives written, `assembleCsr` reports **one unresolved reference**: §12.3.2's "Section 14.3.3". `pdftotext` finds no narrative text in any of the 8 leaves. `csr-assembly-body.ts` `bodyHeadings` draws a §14.x heading only when it is a planned TFL heading. So a drafted §14.3.3 is dropped from the body, and no leaf carries it. The production path (`workflow-source-import.ts` `materializeCsrAssemblySource`) passes `csr_section_outputs`, §14.3.3 included, as the same `sections`, so the same drop would follow. It is not silent: the assembly status is `incomplete`, and the reference is listed as unresolved. The fix belongs to assembly placement (where §14.3.3 is drawn, in the §14 leaf or the body), not to the narrative lane, and this change left it alone.

### Commands (D17)

```
npx vitest run server/services/csr/__tests__/narrative-subject-level-withdrawal.test.ts      # d17-fix-red.txt / d17-fix-green.txt
npx tsx <scratch>/d17/baseline.mts                                                           # d17-byte-identity.txt (before and after)
NODE_OPTIONS="--expose-gc --max-old-space-size=8192" npx tsx <scratch>/pilot-out-v3/run-pilot-v3.mts <dir> <scratch>/pilot-out-v3
python -I <scratch>/d17/narr_oracle.py <dir> <scratch>/pilot-out-v3/narratives.json <out> [day|cause]
python -I <scratch>/d17/spot10.py <dir> <scratch>/pilot-out-v3/narratives.json
npx tsx <scratch>/d17/gate-pilot.mts <dir>
python -I <scratch>/oracle2/tables2.py <dir> <scratch>/pilot-out-v3/engine-tables.json <out>
python -I <scratch>/oracle2/engine_vs_published.py <scratch>/pilot-out-v3/engine-tables.json <scratch>/pilot-out/oracle-pub.json <out>
```

The harness, the narrative dump and the oracles stay in the scratch directory, because the dump holds pilot narratives. The evidence files hold counts only. Attribution: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01, Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>, used under its terms.

## D17 adversarial review (2026-10-30): the cause gate tightened, the EOSDT fallback removed

A second session reviewed D17 against six questions:

- Does any sentence imply a cause of withdrawal?
- Is any event after the withdrawal listed?
- Is any band, category or population invented?
- Does any existing source lose byte identity?
- Does a blank stand in for "not supplied"?
- Was any pilot data committed?

Two defects were found and fixed in D17's own files. Nothing was loosened.

**1. The cause gate accepted 9 of 14 attribution forms.** The reviewer tested these rewrites on the synthetic subject. The first gate refused none of them:

- "The subject was withdrawn for Syncope."
- "Syncope was followed by withdrawal."
- "The subject experienced Syncope. This was the reason for withdrawal."
- "…in view of Syncope", "In response to Syncope, …"
- "Syncope necessitated withdrawal.", "Syncope required discontinuation of study drug."
- "Syncope; the subject was then withdrawn."
- "…discontinued from treatment as Syncope occurred."

The first gate needed a causal phrase from a short list, or a named event together with the word "reason". The fix is in `narrative-reconciliation.ts`. For a subject-level withdrawal, a sentence that holds a withdrawal word is now refused when it does either of these:

- it names any listed event, so an event is never placed beside the withdrawal;
- it uses a causal, consequential or sequencing word. The list now adds "for", "reason", "why", "follow…", "then", "in view/response of", "necessitat…", "requir…", "consequen…", "as", "so", "since", "given" and others.

Only the template's own sentences are exempt, matched exactly as they are built from the facts:

- the withdrawal sentence;
- the undated-onset sentence;
- the ADSL "recorded reason for discontinuation" sentence;
- the no-cause statement.

The composer now takes the withdrawal and undated-onset sentences from the gate, so the two cannot drift apart. Event terms are taken out of a sentence before the withdrawal and causal words are tested, so a term such as "Drug withdrawal syndrome" does not refuse the template (tested).

One limit remains. Two sentences side by side ("Syncope occurred. The subject was withdrawn.") carry no marker the gate can read. That is why the model writes connective prose only.

**2. The withdrawal date fell back to ADSL `EOSDT` when it was not declared.** The flag may record withdrawal from treatment rather than from the study. In that case an end-of-study date lists events that started after the withdrawal as if they came before it. That is the "event after withdrawal" this review hunts for. It also contradicted "declared, never guessed". The date is now taken only from `conventions.aeDiscontinuationDate`. Without that declaration the subject is refused by name ("declare conventions.aeDiscontinuationDate; it is never guessed"). The change is in `narrative-subject-selection.ts` (the fallback), `narrative-compose.ts` (the refusal text), `narrative-subject-facts.ts` (the QC text) and the schema doc comment in `shared/csr-adam-bundle.ts`.

**Checked and found sound:**

- A blank AESER is never read as "not serious". The selection already refuses a blank AESER on every ADAE row, and a test now pins this. The red file records a first test that wrongly assumed otherwise. That test was replaced by the assertion of the existing refusal, and the engine was not changed.
- No band, category or population is invented.
- No pilot value is in any committed file. The new evidence holds counts only.

**Behaviour change, named.** A source that declares `aeDiscontinuationFlag` but not `aeDiscontinuationDate` now gets a refusal by name for a flagged subject. This includes a flagged subject who also has an SAE, which run 2 composed with no mention of the withdrawal. On the pilot, that is the run 2 manifest. `aeDiscontinuationFlag` was introduced in this same pilot work (543e4e1a80). No other source declares it, and the pilot run 3 manifest declares the date.

| Check | Result |
|---|---|
| Red (`d17-review-red.txt`) | 3 of 15 failed: the attribution forms, the `EOSDT` guess, and the mistaken AESER test (see above) |
| Green (`d17-review-green.txt`) | 15 of 15 pass |
| `npx vitest run server/services/csr shared` | 120 files, **1,537 passed** |
| Byte identity (`d17-byte-identity.txt`, section "after the adversarial review") | the same three SHA-256 values as before D17: slice-7 synthetic at 120 and at 1,000 subjects, and the legacy event basis |
| ESLint `--max-warnings 0` on the changed files; `ci:sql-interpolation` | clean; OK |
| `tsc --noEmit -p .` | one error, `adam-source-derivation.ts:72`, in the concurrent D10–D12 file; none in a D17 file |
| Pilot pipeline re-run | 95 selected, **95 composed, 0 refused**, 95 of 95 reconcile (5,043 facts). The narratives and engine tables are byte-identical to run 3. |
| D17 narrative oracle (`narr_oracle.py`) | 1,104 / 1,104 |
| Reviewer's own pandas oracle: 6 DSRAEFL subjects × 5 cells (date = RFENDT, day = RFENDT − TRTSDT + 1, listed set = TEAEs with ASTDT ≤ RFENDT, no later TEAE named, no-cause statement and no causal phrase) | **30 / 30**. Shown failing: a shifted day gave 29/1; "withdrawn for this event" in place of the statement gave 29/1. |
| Pilot gate with the review's forms ("withdrawn for <event>"; "<event> was followed by withdrawal") on all 92 | 92 / 92 refused, 92 / 92 refused; connective-only rewrite 92 / 92 accepted |
| Engine against the table oracle; against the published TLFs | **1,436 / 1,436**; **174 / 174**; 0 mismatched |

Attribution: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01, Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>.

## D10–D12 adversarial review (2026-10-30)

A second session reviewed run 3 against the same questions as the D17 review: an implied cause of withdrawal, an event after withdrawal, an invented band, category or population, a receipt that no longer verifies, a blank or zero standing in for "not supplied", pilot data committed, a loosened test, and lint or gate failures. Two defects were found and fixed in run 3's own files. No test was loosened.

**1. A recorded HEIGHTBL that was not a positive number was dropped from n without notice.** `adam-baseline.ts` read HEIGHTBL with `numeric()`, which returns null for text. So a value such as "tall", 0 or −170 left the subject out of the height n, and nothing reported it. A declared continuous characteristic was already refused in that case. HEIGHTBL is now refused by variable and row (`CSR_ADAM_VALUE_UNMAPPED`, `ADSL[i].HEIGHTBL`). A blank HEIGHTBL is still not recorded, and n shows it (tested: n 3 / 4 / 7).

**2. A declared population could reuse a built-in row's label.** A label such as "Safety" or "mITT" would print a second row of that name with different counts. `shared/csr-source-input.ts` now refuses a declared label that repeats Randomized, Safety, ITT, mITT, Per-Protocol or Completed, ignoring case. This covers a hand-built source and the ADaM route, which parses the same contract.

**Checked and found sound:**
- **Receipts.** Byte identity was checked independently, not taken from the pinned test. The seven pinned digests were recomputed on a `git archive` of HEAD `7e4c7f479e` in scratch, and they equal the values in `csr-table-byte-identity.test.ts`. The pilot run-2 manifest was also run on that HEAD tree and on the working tree. Both give tables digest `4a09d058…`, and the two files are byte-identical (`cmp`).
- **"Not supplied".** §11.4 prints "Efficacy results not supplied" with "—" in every other cell, never blank and never 0. An empty efficacy list without the declaration is refused. So is the declaration with any results present.
- **Nothing invented.** Age groups come only from AGEGR1, so with no AGEGR1 there are no age-group rows. Declared populations are never mapped onto mITT. An armless result prints "—" for its arm and names no comparator.
- **No pilot data committed.** The new evidence holds counts and digests only, and both review tests are synthetic.
- **Withdrawal.** D10–D12 do not touch narratives, so no withdrawal cause or post-withdrawal event can enter through them.

| Check | Result |
|---|---|
| Red (`d10-d12-review-red.txt`) | HEIGHTBL "tall" accepted ("expected a refusal"). A "Safety" label accepted. 1 failed each time. |
| Green (`d10-d12-review-green.txt`) | 18 of 18, with the 7 byte-identity digests unchanged |
| Pilot tables digests after the fixes | base `4a09d058…` (= HEAD), declared `7670fc7c…`, no-efficacy `e4504e2b…`: all unchanged from run 3 |
| Reviewer's own pandas oracle, 30 cells chosen independently. EFFFL and COMP24FL per arm and Total (8). Height mean (SD) (4). Disease-duration median (4). MMSE min, max (2). Education mean (SD) (2). AGEGR1 >80 n (%) (4). BMIBLGR1 ≥30 (2). Hispanic or Latino (2). Low-dose weight n = 83 (1). BMI Total mean (SD) (1). | **30 / 30**. Shown failing: an EFFFL count off by one gave 29 / 1. |
| Run-3 oracle (`oracle3/tables3.py`); engine against the published CSR (`engine_vs_published3.py`) | **203 / 203**; **229 / 229** |
| Run-2 oracle and published comparison on the run-2 manifest | **1,436 / 1,436**; **174 / 174** |
| ESLint `--max-warnings 0` on the changed files; `ci:sql-interpolation` | clean; OK |
| `ci:tenant-isolation` | the same single finding in `vault-placement.service.ts`, a file this work does not touch |

**Not fixed, and outside these files:**
- With efficacy not supplied, the source still asserts `completeDomains.efficacy: true`, a literal in the contract. Nothing in assembly or readiness marks such a CSR as lacking efficacy. Only §11.4 states it.
- The published contract text in `shared/csr-source-contract.ts` (`validationRules`, `derivationRules`) does not yet describe armless results, `efficacyStatus`, `conventions.populations` or `conventions.demographics`. Its JSON schema is generated from the Zod schemas and does include them. (Fixed with D18, below: the rules now name every declared field, and a contract test fails when one is not.)

Attribution: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01, Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>.

## D18 fixed (2026-10-30): the narratives are their own §14.3.3 leaf, hash-verified

Launch rows D2 / D4, workstream W1. Run 3 composed all 95 narratives and landed §14.3.3, but assembly dropped it. `bodyHeadings` drew a §14.x heading only for a planned table, so no leaf held narrative text, and §12.3.2's "Section 14.3.3" was an unresolved reference.

**Outcome on the pilot:** §14.3.3 is filed as `csr-14-3-3-narratives.pdf` under 5.3.5.1. It holds **95 of 95** narratives, each checked against its stored SHA-256. It is 42 pages, with 95 subject bookmarks and named destinations. Assembly now reports **0 unresolved references**, against 1 at HEAD. An independent check of the PDF text found all 95 stored narratives in the leaf, in order.

### What already exists

Searched before any change, across `server/`, `shared/` and `client/src`:
- names: `bodyHeadings`, `tflHeadings`, `planTfls`, `leafTargets`, `CSR_TFL_NUMBERS`, `14.3.3`, `narrativesSection`, `narrativeSectionBlock`, `sqlNarrativeStore`, `csr_narrative_outputs`, `STF_DOCUMENT_FILE_TAGS`, `readLeafTargets`, `verifyListingReceipt`, `materializeCsrAssemblySource`, `notApplicable` and `parseDeclarations`;
- the client board, `CsrAssemblyControl.tsx`.

`git log --all --diff-filter=D` was also run on `*narrative*`, `*assembl*` and `*14-3-3*`. Nothing deleted renders a CSR §14.3.3. The hits were CER and IND narrative scripts and deprecated document-assembly routes.

No §14.3.3 leaf, renderer or check existed. Each piece below is **extended in place**:

| Piece | Path | What it did | What it does now |
|---|---|---|---|
| Assembly plan | `csr-assembly-plan.ts` | §14 tables only | Adds the §14.3.3 file name, its STF role, per-subject destinations `N-<subject>`, and `CsrDeclarable` (a §16 appendix, or §14.3.3) |
| Narratives leaf | `csr-assembly-narratives.ts` (new, 148 lines) | — | Draws and checks §14.3.3 (below). It reuses `narrativeSectionBlock`, `CsrPdfWriter` and `readLeafTargets`. |
| Assembler | `csr-assembly.ts` | §14.3.3 drawn into the body (`sections`), then dropped by `bodyHeadings` | Takes the landed §14.3.3 out of the body and files it as its own leaf; when it is missing, it is a blocking gap, or declared not applicable |
| Body | `csr-assembly-body.ts` | No §14.3/§14.3.3 heading without a planned table | Draws §14, §14.3 and §14.3.3 whenever §14.3.3 is filed, missing or declared. "Filed as" links to the leaf, and there is one link per subject |
| Production source | `csr-assembly-source.ts` | Sections only | Reads the build's stored narratives through `sqlNarrativeStore(q).page`, 50 at a time. When §14.3.3 has not landed, the gap names the narrative job's composed and refused counts |
| Queue | `csr-assembly-run.ts` | Only §16 could be declared not applicable | Also §14.3.3, with a reason; the assembly summary records the narratives check |
| Lifecycle | `csr-placement-lifecycle.ts` | — | Labels the part "the Section 14.3.3 narratives" |
| Client | `CsrAssemblyControl.tsx` | Lists every missing item with a "Not applicable because" field | **Unchanged.** §14.3.3 appears there as a blocking item, like any appendix |

The narrative job, the store schema, the composer and the gate are untouched. The test `MemoryStore` was moved, unchanged, from `csr-narrative-job.test.ts` to `__tests__/support/narrative-memory-store.ts`, so there is one copy.

### How §14.3.3 is filed, and what is checked

**STF role: `study-report`.** The reviewed list `STF_DOCUMENT_FILE_TAGS` has no role for E3 narratives. Its `subject-profiles` tag is for patient profiles, which are a different document. §14.3.3 is part of the report, so it is filed as the §14 tables leaf is. **Gap, named:** that list is recall (`not read` against the ICH eCTD STF Specification v2.6.1). Whether the specification has a narratives-specific role is unverified.

**Streamed one narrative at a time.** The leaf is drawn as follows:
- the landed opening;
- then each stored narrative, read 50 at a time;
- each narrative under a level-2 bookmark for its treatment group and a level-3 bookmark for its subject, with the named destination `N-<subject>`;
- the leaf's own destination is `H14.3.3`.

Pages drain to the file as they are written. On the pilot, the store was read 3 times, at a limit of 50.

**Fails closed.** The leaf is filed only when every check below passes. Otherwise the file is removed, and §14.3.3 is a **blocking** missing item with the reason:
1. **Landed text equals the stored narratives.** The landed section must be exactly the opening followed by each stored narrative's block, in order, with nothing left over. A narrative edited or recomposed after landing does not match, and neither does an old selection. The finding names the subject.
2. **Each narrative has its recorded hash.** The SHA-256 of each stored narrative's text must equal its `content_hash`.
3. **Each narrative is drawn as stored.** The fonts' one rule, `toWinAnsiSafe`, must leave the text unchanged. The receipt records the stored and the drawn SHA-256 per subject.
4. **Destinations are in the PDF.** Read back from the written PDF (`readLeafTargets`), the leaf must define `H14.3.3` and every subject's destination.
5. **Links resolve.** The body's structural check resolves its link to the leaf and every per-subject link against the leaf's named destinations. This covers §12.3.2's "Section 14.3.3".

**Not landed is a gap, never an empty leaf.** If no narrative run has completed, §14.3.3 is listed as blocking. The reason names what the narrative job has saved, for example "6 composed and 89 refused". Placement already refuses any blocking missing item. Each of these is refused: a §14.3.3 declared not applicable with a reason shorter than 8 characters, a declaration made while narratives have landed, and (review fix, 2026-10-30) a declaration made while the narrative job has saved any composed or refused narrative for the build, since subjects were then selected and §14.3.3 applies (both `CSR_ASSEMBLY_APPENDIX_AMBIGUOUS`; red then green in the D18 narratives suite). A declared §14.3.3 with a valid reason is listed, and the body says it does not apply.

### Red, then green (SYNTHETIC)

Tests:
- `csr-assembly-narratives.test.ts` (8): the narrative job's real output on the LMN-201-shaped synthetic study, plus 4,000 synthetic subjects for scale;
- one production-path case in `csr-assembly-run.pglite.test.ts`: the narratives are saved through `sqlNarrativeStore` into the real `csr_narrative_outputs` table, read back by `assembleCsrJob`, and placed.

| Check | Result |
|---|---|
| Red (`d18-fix-red.txt`) | 8 of 8 failed. The key failure is the defect itself: an assembly of a build with landed narratives had no §14.3.3 leaf, and `unresolvedReferences` was `[{ reference: "Section 14.3.3", section: "12.3.2" }]`. The scale case then ran at 1,500 subjects; it was raised to 4,000 so that the leaf exceeds 150 pages. |
| Green (`d18-fix-green.txt`) | 32 of 32 across the narratives, run and assembly suites. Scale: 4,000 subjects, more than 600 narratives, more than 150 pages, all verified, every read at most 50. Each case is refused: a narrative edited after landing, a wrong stored hash, a landed section with no stored narratives, narratives not landed, and an ambiguous declaration. A narrative edited in the database table after landing is caught on the production path. |
| Existing suites | `csr-assembly.test.ts` now assembles with the study's narratives landed. Its packaging test finds `csr-14-3-3-narratives.pdf` in the study folder. The scale test declares §14.3.3 not applicable, because it measures listings. The pglite placement tests declare it as they declare every blocking item. |

### On the pilot (`d18-pilot.json`; counts, times and memory only)

The manifest and harness are run 3's (`aeDiscontinuationDate: 'RFENDT'`). The harness passes the narrative store to `assembleCsr` as `narratives`.

| Check | Result | Shown failing |
|---|---|---|
| Narrative job | complete: 95 selected, 95 composed, 0 refused; 95 reconcile (5,043 facts) | — |
| Landed §14.3.3 | 143,303 characters (143,493 bytes); §12.3.2 1,822 | — |
| `assembleCsr` | **20.4 s**. Heap after 243.6 MiB, max RSS **421 MiB**; the whole harness took 31.0 s wall time. 9 leaves, **3,676 pages**. **0 unresolved references**. 150 links checked (49 in run 2), all resolved. | At HEAD `84505775ad` (a `git archive` in scratch): 8 leaves, no §14.3.3 leaf, 1 unresolved reference ("Section 14.3.3", from §12.3.2), and no stored narrative's text in any leaf (7 checked; the laboratory listing was not read) |
| §14.3.3 leaf | `csr-14-3-3-narratives.pdf`, 42 pages, 112,308 bytes, `study-report`, 5.3.5.1. Verified: **95 subjects**, 0 findings. The receipt's stored and drawn SHA-256 equal the store's hash for all 95. | — |
| Independent check from the PDF bytes (`check_leaf.py`: poppler `pdftotext -raw` and `pdftohtml -xml`, `python -I`, no product code) | Stored hashes recomputed: 95 / 95. Narrative text found in the leaf, in order: **95 / 95**. Outline items "Subject …": 95, in the stored order. `pdfinfo` pages: 42. | One word changed in one stored narrative: 94 / 95 found, naming that 1 |
| Pages per leaf | body 5, §14 tables 22, **§14.3.3 42**, 16.2.1 5, 16.2.2 1, 16.2.3 1, 16.2.4 10, 16.2.7 74, 16.2.8 3,516 | — |

Status is still `incomplete`, for run 2's reasons only:
- the 16.1.x, 16.2.6 and 16.3 sponsor documents were not supplied (9 blocking);
- the harness-written one-line body reaches 3 bookmark levels (`BOOKMARK_DEPTH`).

§14.3.3 is no longer among the reasons.

### Not done, and why

- **The import holds §14.3.3 as one string.** (Fixed later: see [§14.3.3 by reference](#1433-by-reference-2026-10-30-the-import-holds-the-narratives-as-a-reference-to-the-store).) `materializeCsrAssemblySource` reads every section whole, and so does the import into Authoring. That includes the landed §14.3.3, which the leaf is checked against. The narratives themselves are read 50 at a time. The pilot's §14.3.3 is 143 KB. The import refuses more than 2,000,000 characters across all sections (`WORKFLOW_SOURCE_LIMIT`). That is roughly 1,300 pilot-length narratives, and a larger build fails closed at the import before assembly. Making that read stream would change the import's fingerprint and the Authoring import, which is a separate change.
- **The STF role** is `study-report`, chosen from the reviewed recall list. It is unverified against the ICH STF specification (see above).
- **The pilot ran through `assembleCsr`, not the queued `assembleCsrJob`.** The pilot has no database build. The SQL read path (`sqlNarrativeStore.page` over `csr_narrative_outputs`) is proven on synthetic data in `csr-assembly-run.pglite.test.ts`.

### The source contract's rules (`shared/csr-source-contract.ts`)

The run-3 review found that the published rules did not describe these declarations:
- armless efficacy results;
- `efficacyStatus 'not-supplied'`;
- `conventions.populations` and `conventions.demographics`.

The JSON schema already carried them, because it is generated from the Zod schemas. The rules are rewritten from the validator and the derivation as they stand. Each statement was checked against `csr-source-input.ts`, `adam-source-derivation.ts`, `adam-baseline.ts`, `adam-rows.ts`, `narrative-subject-selection.ts` and the table builders.

The rules now state:
- the armless result: method and population, no comparator, keyed by method;
- `efficacyStatus "not-supplied"` with `completeDomains.efficacy` false, and §11.4's "Efficacy results not supplied";
- `additionalPopulations`, with the built-in labels it may not repeat;
- `demographicsPresentation "descriptive"`, `ageGroups` and `baselineCharacteristics`;
- `aeDiscontinuationBasis`;
- the D1–D9 conventions: `disposition`, `aeDiscontinuationFlag`, `causality`, `rangeIndicator`, `lastOnTreatment` and `exposure`;
- `conventions.aeDiscontinuationDate` (D17);
- `conventions.populations` and `conventions.demographics`;
- the optional efficacy file and its refusal codes;
- `adverseEventsOfSpecialInterest`;
- every remaining optional field, by name.

`shared/__tests__/csr-source-contract.test.ts` walks the generated JSON schemas. It fails when any optional field of the source, the manifest or the efficacy file is not named in the rules that govern it. A manifest convention must be named as `conventions.<key>`.

| Check | Result |
|---|---|
| Red (`contract-rules-red.txt`) | 43 source fields, 23 manifest fields and 7 efficacy-file fields were unnamed. The D10–D12 statements were absent. |
| Green (`contract-rules-green.txt`) | 3 of 3 |
| Shown failing | With the `efficacyStatus` rule and the `conventions.populations` rule removed, the test names both |

### Gates

| Gate | Result |
|---|---|
| `npx vitest run server/services/csr shared server/services/authoring/__tests__/workflow-source-import.pglite.test.ts` | 124 files, **1,593 passed** |
| `npx vitest run server/routes/__tests__/csr-jobs-assembly.pglite.test.ts client/src/concept2cure/v2/__tests__/csrAssemblyControl.test.tsx` | 17 passed |
| ESLint `--max-warnings 0` on the changed files | clean |
| Largest changed file | `csr-assembly.ts`, 348 lines |
| `ci:sql-interpolation` | OK |
| `ci:tenant-isolation:no-regression` | OK, 0 findings above baseline |
| `ci:launch-scope-api` | 564 paths, none refused |
| `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .` | exit 0, no error (5 min) |

### Commands (D18)

```
npx vitest run server/services/csr/__tests__/csr-assembly-narratives.test.ts      # d18-fix-red.txt / d18-fix-green.txt
npx vitest run shared/__tests__/csr-source-contract.test.ts                         # contract-rules-red.txt / -green.txt
NODE_OPTIONS="--expose-gc --max-old-space-size=8192" npx tsx <scratch>/d18/run-pilot-d18.mts <dir> <scratch>/d18/out
python3 -I <scratch>/d18/check_leaf.py <leaf.pdf> <body.pdf> <scratch>/d18/out/stored-narratives.json [perturb]
git archive HEAD server shared package.json tsconfig.json | tar -x -C <scratch>/d18/head   # the red at HEAD, run with the same harness
```

The harness, the narrative dump (`stored-narratives.json`) and the assembled leaves stay in the scratch directory, because they hold pilot narratives. The evidence files hold counts only. Attribution: CDISC SDTM/ADaM Pilot Project, study CDISCPILOT01, Clinical Data Interchange Standards Consortium (CDISC), <https://github.com/cdisc-org/sdtm-adam-pilot-project>, used under its terms.

## §14.3.3 by reference (2026-10-30): the import holds the narratives as a reference to the store

Launch rows D2 / D4, workstream W1. Closes the first "Not done" item of D18. The import into Authoring and the assembly source read every saved section whole, including the landed §14.3.3, and refused more than 2,000,000 characters across all sections (`WORKFLOW_SOURCE_LIMIT`). That is about 1,300 narratives. The design's target is 1,000 narratives per build, and real studies exceed it.

**Outcome (SYNTHETIC):** a build with 1,500 landed narratives (2,327,062 characters) was refused at import. It now imports, and the Authoring section holds 579 characters in all. The editor shows §14.3.3 read-only, with the reference's count, a paged view of the stored narratives and the QC list. Assembly files all 1,500, each checked against its stored SHA-256. After import, a stored narrative edited in the table makes the import, the assembly and the placement refuse, and the refusal names the subject. At 5,000 narratives (7,755,952 characters) the import takes 4.7 s and the assembly of §14.3.3 takes 21.6 s. Peak heap is 171 MiB (table below).

### What already exists

Searched before any change, across `server/`, `shared/` and `client/src`. Names searched: `WORKFLOW_SOURCE_LIMIT`, `materializeCsrAssemblySource`, `materializeWorkflowSource`, `verifySavedWorkflowImport`, `sectionOrigins`, `csrEvidence`, `narrativesSectionHead`, `narrativeSectionBlock`, `renderNarrativesLeaf`, `sqlNarrativeStore`, `readCsrNarrativeQc`, `NarrativeQcItem`, `ImportSourceNotice`, `contentReadOnly`, `Pagination`, `nextCursor`, `reference`. `git log --all --diff-filter=D` was also run on `*narrative*`, `*Narrative*` and `*NarrativeReference*`. It found `SafetyNarrativeQcPanel.tsx`, `SafetyNarrativeAffordance.tsx` and `safetyNarrativeBatch.ts`, deleted 2026-08-04 in `2895218b8b`. That is the single-subject AnA batch UI, whose QC list the slice-7 build board already restored (`CsrBuildProgress.tsx`), and this change reuses that list. It also found the CER and IND narrative scripts and Module 2 narratives. None of them held a §14.3.3 reference or a viewer of stored narratives.

No reference form of a section existed. Each piece below is **extended in place**:

| Piece | Path | What it did | What it does now |
|---|---|---|---|
| Import / assembly source | `server/services/authoring/workflow-source-import.ts` | Selected §14.3.3's text with every other section; the 2,000,000 limit counted it | Never selects §14.3.3's text (`CASE … THEN NULL`). §14.3.3 becomes the landed opening plus a reference on its section origin. `facts` carries the reference too, so the fingerprint covers it. `materializeCsrAssemblySource` returns the inline sections and `narratives` (the reference). The limit is unchanged and counts the inline sections only |
| Reference section | `server/services/authoring/csr-narrative-reference-import.ts` (new, 56 lines) | — | Makes the reference, or refuses with the importer's own codes: `WORKFLOW_CSR_NARRATIVE_MISMATCH` naming the subject, or `WORKFLOW_CSR_HASH_MISMATCH` |
| Landed text and walk | `server/services/csr/csr-narrative-landed.ts` (new, 166 lines) | The match was inside the leaf renderer, over a string | `sqlLandedNarratives` reads the landed row as its database-checked hash, its length, its opening and slices, never whole. `walkLandedNarratives` is the D18 match, unchanged in rule. It reads one slice of landed text per page of 50 stored narratives. `readCsrNarrativeReference` reads the store digest before and after the walk |
| Reference type | `shared/csr-narrative-reference.ts` (new); `WorkflowSectionOrigin.narrativeReference` in `shared/authoring/source-import.ts` | — | `{ jobId, narratives, storeDigest, landedSha256, landedLength, openingSha256 }`, parsed field by field |
| Leaf | `server/services/csr/csr-assembly-narratives.ts` | Matched over `section.content` | Draws through `walkLandedNarratives`. The checks are the same: landed equals stored, recorded hashes, `toWinAnsiSafe`, destinations read back |
| Assembler | `csr-assembly.ts`, `csr-assembly-source.ts` | §14.3.3 came only through `sections` | It also takes `landedNarratives`. The production source passes the database reader and refuses `CSR_ASSEMBLY_SOURCE_CHANGED` if the landed hash or length differs from the reference |
| Store read for the viewer | `csr-narrative-store.ts` `readCsrNarrativeTextPage`; route `GET /api/csr/jobs/:jobId/narratives/text` in `server/routes/csr-jobs-narratives.ts` | The QC list only (no text) | Returns one page of composed narratives (at most 50), keyset-paged, each with the database's own hash verdict. Access is the job's project, read as the signed-in user, as for the QC list |
| Editor | `client/src/concept2cure/v2/editor/CsrNarrativeReferenceView.tsx` (new); `DocumentWorkbench.tsx` (+5 lines); `ImportSourceNotice.tsx` | §14.3.3 was editable inline text | The section is read-only (`contentReadOnly`). Above it, the view shows the count, the build, both digests, the stored narratives 20 at a time with Previous and Next, a failed hash as an alert, and the QC list |
| QC list | `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` | `NarrativeQcItem` list inline in the board | Exported as `NarrativeQcList` and reused in the editor. There is one copy |

No schema changed (RULE 1 does not apply). The D5 gates are not changed: release, review, approval and `csr-scientific-review.ts`. Release governance (`workflow-import-governance.ts`) already re-materializes through `verifySavedWorkflowImport`. Through that existing call, an edited store now refuses release with `WORKFLOW_SOURCE_UNAVAILABLE`.

### What the reference binds, and what fails closed

- **Import fingerprint.** The reference sits on §14.3.3's section origin and in `facts`. Both are inside the fingerprint, and `verifySavedWorkflowImport` deep-compares the origins.
- **Store digest.** SHA-256 over every row of `csr_narrative_outputs` for the build. Each row contributes its subject, sequence, status, recorded hash, the database's SHA-256 of its text, its facts digest and its QC record. Any edit to any row changes it, including one the landed text cannot show. Case tested: a facts digest edit makes an earlier assembly `CSR_PLACEMENT_ASSEMBLY_STALE`.
- **Narrative edited after import.** This was tested twice: with the text and its hash both changed, and with the text alone. In both cases the import is refused, `WORKFLOW_CSR_NARRATIVE_MISMATCH`, and the message names "the narrative of subject SYN-00738 in the section". Assembly is refused with the same message. Placement of an assembly made before the edit is refused as `CSR_PLACEMENT_SOURCE_UNVERIFIED`, with the same subject named. A control assembly of the build as imported is placed.
- **Landed §14.3.3 edited under its recorded hash.** Refused with `WORKFLOW_CSR_HASH_MISMATCH`. The database computes the check; the text is not read into the server.
- **Unchanged from D18.** A narrative that has not landed is a blocking gap.
- **Existing imports.** An Authoring copy imported before this change, of a build with a landed §14.3.3, no longer verifies, because its fingerprint was computed over the inline text. Its release is refused, fail closed. To proceed, import it again.

### Red, then green (SYNTHETIC)

The tests are `server/services/csr/__tests__/csr-narrative-reference.pglite.test.ts` (8 cases). They use the real migration, the real SQL store, the real import, assembly and placement, and real access checks. Only the retained run's tables are a fixture. The fixture is `support/narrative-reference-fixture.ts`. It saves the narratives and streams §14.3.3 through `sqlNarrativeStore`, as the narrative job does. Every subject and sentence in it is invented.

| Check | Result |
|---|---|
| Red (`ref-red.txt`, at the code before the change) | 4 of 7 failed. The 1,500-narrative import and the assembly both failed `WORKFLOW_SOURCE_LIMIT`. Neither tamper case found a reference. 3 passed: the size check, the inline limit, and the landed-hash refusal. Those 3 hold before and after |
| Green (`ref-green.txt`: this suite with the D18 narratives, assembly-run and import suites, the route and the editor view; 6 files, 68 passed) | 8 of 8. The import holds the opening (579 inline characters) and `narratives: 1500`. Assembly verifies 1,500 of 1,500, the receipt's stored hash equals each row's, and the drawn hash equals the stored one. The fingerprint equals the import's. The inline limit still refuses 2,000,001 characters. Each tamper is refused naming SYN-00738, at import, at assembly and at placement. The facts-digest edit is stale at placement |
| Shown failing (`ref-mutation-facts-digest.txt`) | With the facts digest left out of the store digest, the facts-digest case fails: the digest is unchanged |
| Shown failing (`ref-mutation-walk.txt`) | With the walk's mismatch finding removed, both tamper cases fail: the import resolved instead of refusing |
| Route | `csr-jobs-narratives.pglite.test.ts`: the text page, the keyset cursor, and `CSR_NARRATIVE_PAGE_INVALID` |
| Editor | `client/src/concept2cure/v2/__tests__/csrNarrativeReferenceView.test.tsx` (3 cases). It covers the count (1,500), pages 1–20 and 21–40 and back, the request's cursor, a failed hash shown as an alert, the QC list, a refused read shown as stated, and that a malformed reference is not shown. The 5 lines that mount the view in `DocumentWorkbench.tsx` are covered by the typecheck only; no workbench-level test renders an imported CSR |

### Scale (`ref-scale-1500.json`, `ref-scale-5000.json`; `ref-measure.mts`)

Synthetic narratives average about 1,400 characters. One process per size, with `--expose-gc`. PGlite runs in the same process, so RSS includes the database. "Assembly" is `assembleCsr` with the database reader for §14.3.3, plus the slice-8 fixture's tables and listings. The production `assembleCsrJob` also runs the import first (the "Import" row).

| | 1,500 narratives | 5,000 narratives |
|---|---|---|
| Landed §14.3.3 | 2,327,062 characters | 7,755,952 characters |
| Import (`materializeWorkflowSource`) | 0.74 s; heap 105.7 → peak 115.1 MiB | 4.70 s; heap 105.9 → peak 112.4 MiB |
| Inline characters imported | 579 | 579 |
| Assembly | 6.05 s; heap 107.7 → peak 142.6 MiB; peak RSS 783 MiB | 21.6 s; heap 107.9 → peak 170.8 MiB; peak RSS 822 MiB |
| §14.3.3 leaf | 563 pages, 1,096,049 bytes, 1,500 verified, 0 findings | 1,876 pages, 3,656,767 bytes, 5,000 verified, 0 findings |
| Store pages read (50 each) | 31 | 101 |

Heap stays flat as the narratives grow, because the text is never held whole. The import time grows faster than the narrative count: 3.3 times the narratives took 6.3 times as long. Each page's slice is a separate `substr` of the landed row; this has not been profiled. The assembly time grows about linearly.

### Not done, and why

- **The server does not refuse a save to the §14.3.3 section.** The editor shows it read-only, but the Authoring save paths in `authoring.router.ts` (8,407 lines) do not know the reference. If the opening is edited through the API, the document's copy differs from the reference's `openingSha256`. The import, the assembly and release still read the store and the landed row, not the document's copy, so the filed narratives cannot change that way. The opening shown in Authoring can.
- **The AnA saved-document critique** (`server/services/ana/csr-saved-evidence.ts`) does not re-read the store for a reference. Release governance does, through `verifySavedWorkflowImport`.
- **Import time is superlinear** (above). It is under 5 s at 5,000 narratives, 5 times the design's target.
- **The measurement is PGlite in-process,** not a production Postgres.

### Gates

| Gate | Result |
|---|---|
| `npx vitest run server/services/csr shared server/services/authoring` | 201 files; 3,139 passed, 1 failed. The failure is `cross-sector-builtin-authoring-templates.test.ts` (446 against an expected 392 builtin templates). It fails identically at HEAD `e0c7cad3c0` (a `git archive` in scratch). This change does not touch it |
| Touched suites: `server/routes/__tests__/csr-jobs-{assembly,narratives,build-and-review}.pglite.test.ts`, `client/src/concept2cure/v2/__tests__/csr*`, `client/src/concept2cure/v2/editor/__tests__` | 82 files; 1,225 passed, 3 failed. The 3 are `authoringConversationScopeLive.test.tsx` 5 s timeouts, and they fail identically at HEAD |
| ESLint `--max-warnings 0` on every changed file except `DocumentWorkbench.tsx` | clean |
| `DocumentWorkbench.tsx` (6,612 lines; 6,608 before this change, already over the limit) | the same 12 warnings as at HEAD; none new |
| Largest changed file otherwise | `csr-assembly.ts`, 361 lines |
| `ci:sql-interpolation` | OK |
| `ci:tenant-isolation:no-regression` | OK, 0 findings |
| `ci:launch-scope-api` | 567 paths, none refused |
| `ci:migration-drop-safety` | OK (no migration changed) |
| `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .` | exit 0, no error (on the final tree) |

### Commands (§14.3.3 by reference)

```
npx vitest run server/services/csr/__tests__/csr-narrative-reference.pglite.test.ts     # ref-red.txt / ref-green.txt
npx vitest run client/src/concept2cure/v2/__tests__/csrNarrativeReferenceView.test.tsx server/routes/__tests__/csr-jobs-narratives.pglite.test.ts
NODE_OPTIONS="--expose-gc --max-old-space-size=8192" npx tsx docs/evidence/D2-CSR/2026-10-30-cdisc-pilot-e2e/ref-measure.mts 1500 <out.json>   # and 5000
```
