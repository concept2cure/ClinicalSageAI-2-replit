# FBT-201 synthetic data verification and CSR provenance — 2026-11-02

**Type:** data-only audit record. **Clinical verification:** NOT ESTABLISHED. **Actual tenant and application ingestion:** NOT PERFORMED.

## Material examined

The supplied `Faux_Biotech_CSR_Full_Lifecycle_Demo_Data.zip` was inspected locally in the active session, using the 14 named source files and `14_MANIFEST.json` (the manifest does not list itself). Original files are delivered in the conversation archive, not automatically available in the production Vault.

**Integrity:** 14/14 files exactly matched the supplied manifest's SHA-256 digests and byte counts. This is byte-integrity verification of a **synthetic demonstration archive**, not an assertion of clinical validity, CDISC conformance or regulated source certification.

## Deterministic consistency checks

| Check | Result |
|---|---|
| Distinct ADSL participants | 160 records, 160 unique IDs |
| Arm allocation | 80 active, 80 placebo |
| ADEFF visit rows | 320; each ID has Baseline and Week 12 |
| ADLB ALT visit rows | 320; each ID has Baseline and Week 12 |
| AE records | 79; every subject ID exists in ADSL |
| ADEFF baseline PASI vs ADSL baseline | 0 discrepancies |
| ADEFF Week 12 PASI75 flag vs ADSL | 0 discrepancies |
| Week 12 PASI75 vs at least 75% reduction from baseline | 0 discrepancies |
| AE treatment assignment vs ADSL | 0 discrepancies |
| Submitted primary efficacy TLF counts | Matches reconstructed ADSL |
| Submitted safety TLF counts | Matches reconstructed ADAE |
| Ages in synthetic ADSL | 19–72 |
| Sex entries in synthetic ADSL | 88 Male, 72 Female |
| All manifest source checksums | 14 of 14 match |

## Cohort-level result reconciliation

| Value | FBT-201 200 mg | Placebo |
|---|---:|---:|
| Randomized / ITT / Safety N | 80 | 80 |
| Week 12 PASI75 | 52/80 (65.0%) | 30/80 (37.5%) |
| Completed treatment | 76/80 | 77/80 |
| Any TEAE (unique subjects) | 42/80 | 37/80 |
| SAE (unique subjects) | 3/80 | 2/80 |
| AE withdrawal (unique subjects) | 2/80 | 1/80 |

Active minus placebo absolute response-rate difference is **27.5 percentage points**. The source summary's unadjusted Wald 95% confidence interval is **12.6–42.4 percentage points**; Fisher exact two-sided p-value **0.0008401840557253169**, independently cross-checked from the 2×2 table. These are descriptive demonstrations of the simulated data—not a test of a medical product.

`ADSL_160_SUBJECT_QC_INDEX.csv` in this directory is a **derived 160-row index**, reconstructed from the existing ADSL and ADAE binary outcome flags. It carries subject ID, study, arm, ITT/safety flags, PASI75, completion, TEAE, SAE and AE-withdrawal indicators. It intentionally excludes age, sex, PASI measurements, AE terms and laboratory measurements, which remain in the full archive. It is not a replacement for the four original participant-level CSV files.

## What the source material does not establish

- Dosing administration/exposure, treatment adherence, site monitoring or protocol deviations.
- A validated clinical analysis plan, estimand, multiplicity strategy, or confirmatory clinical efficacy.
- Drug-related adverse event causality, laboratory grade or medical safety adjudication.
- Real patient identity, consent, investigators, trial registration, IRB/ethics approvals or regulatory submission.
- Real organization provisioning, stored Vault artifacts, AnA drafting, governed reviewer signatures or completed workflow tasks.

**Release claim: NONE.** Demo acceptance must be established in a separate, authorized application session that creates the organization, imports original source files, verifies persisted source hashes and reopens the CSR.

## ICH E3 section / source map

| ICH E3 section | Demo evidence or gap |
|---|---|
| 1 Title | 00_ORGANIZATION_AND_STUDY.json; 10_CSR_DRAFT_ICH_E3.md |
| 2 Synopsis | 09_TLF_SUMMARY.json; TLF efficacy and safety CSVs |
| 3 Contents | 10_CSR_DRAFT_ICH_E3.md |
| 4 Abbreviations | 10_CSR_DRAFT_ICH_E3.md |
| 5 Ethics | Explicitly not applicable; no real trial |
| 6 Investigators | Fictional study roles, not trial-site data |
| 7 Introduction | Fictional sponsor and biologic; no external research claim |
| 8 Objectives | 07_PROTOCOL_v2.md |
| 9 Investigational plan | 07_PROTOCOL_v2.md; 08_SAP_v1.md; missing exposure records |
| 10 Study participants | 01_ADSL_synthetic.csv |
| 11 Efficacy | 01_ADSL; 02_ADEFF; 05_TLF_11_4; 09_TLF_SUMMARY |
| 12 Safety | 03_ADAE; 04_ADLB; 06_TLF_12_2; missing exposure and vital signs |
| 13 Discussion | 10_CSR_DRAFT_ICH_E3.md; qualified synthetic-only |
| 14 Tables/figures | 05 and 06 TLF CSVs, remaining tables not provided |
| 15 Reference list | Protocol, SAP and synthetic data only |
| 16 Appendices | Source package; actual regulated appendices unavailable |

**Rule for the demo:** separate statistical **arithmetic verified against this synthetic package** from **clinical evidence not established**; do not represent an illustrative approval or signature as actual.
