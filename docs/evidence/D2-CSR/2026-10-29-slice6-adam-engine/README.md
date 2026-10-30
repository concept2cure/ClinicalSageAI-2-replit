# D2 / D4 — CSR slice 6: complete the deterministic engine with ADaM ingestion and a wider table set (LMN-201 first)

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 6. Launch rows: D2 (Authoring) and D4 (biostatistics evidence). Workstream W1. Board row: "AnA builds a CSR end to end". The D5 lane keeps release, review, approval, signing, transmission and the Rule-2 narration tools; none of those files were edited.

## What already exists

These were found by searching for ADaM, ADSL, ADAE, Dataset-JSON, itemGroupData, XPORT, xpt, csr-source, buildCSRTables, vital and conmed in `server/`, `shared/`, `client/src/`, `scripts/` and `data/seeds/`, and by reading the files below.

- `server/services/csr-tabulation-builders.ts` `buildCSRTables` builds 11 aggregate tables from the `concept2cure.csr-source.v1` study data. It had no vital-sign, ECG or concomitant-medication table. In §10.1 it printed a status no record used as `0`, and it labelled the completion row "Completed treatment" whatever the source meant. **Fixed and extended.**
- `shared/csr-source-input.ts` and `shared/csr-source-contract.ts` define and document the source contract. **Extended additively.** The new fields are optional, so existing sources still parse.
- `server/services/csr/vault-source-input.ts` loads one approved Vault JSON with exact-version, digest and lifecycle checks. **Extended.** A manifest now names ADaM files, and each one passes the same checks.
- `server/services/csr/saved-clinical-tables.ts` re-derives the tables from the retained `clinicalStudyData` snapshot of a sealed run, through `buildCSRTables`. `csr-scientific-review-core.ts` hashes the whole table bundle, including titles and labels (`scientificTablesSha256`). **Not changed**, because the retained snapshot is the derived study data, so receipts keep verifying.
- `server/services/clinical-regulatory-evidence/dataset-json-structure.ts` and `xpt-structure.ts` (Data Room catalog) read Dataset-JSON and SAS transport v5 **structure only**, by design. **Reused** as the format gate. Observation decoding was added beside them in the CSR service, because only a governed CSR source load may read rows.
- `server/services/csr/cortex-authoring-context.ts` holds the section-to-table map. §12.5 deliberately had no mapping. **Extended.**
- `data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.mjs` writes demo CSVs named after ADaM domains, plus a hand-built csr-source.v1 JSON. It is not Dataset-JSON or XPT, nothing on a product path reads it, and **it was not changed**.
- Nothing in the repository read ADaM rows into a CSR path before this slice (design inventory, "Ingest TFL outputs … missing").

## What changed

1. **§10.1 defect (red first).** A status is reported only if the source recorded it, meaning the source declared it (`dispositionCategories`) or a record used it. Any other status reads **"not recorded"** in every cell, never `0`. A status that one arm uses is a recorded zero in the other arms. `dispositionBasis: 'end-of-study'` labels the row "Completed study". A source that declares no basis keeps the previous label.
   - A source that records every status renders byte-identically to the previous builder. The test pins every cell.
   - Every other table is unchanged by the new fields, so retained-table digests for such sources still verify.
   - Red: `red-disposition-death-zero.txt` ("Death" printed `0` for a source that never recorded death).
2. **ADaM ingestion.**
   - `server/services/csr/adam-dataset-reader.ts` reads Dataset-JSON v1.1 (JSON and NDJSON) and v1.0 with exactly one dataset, plus SAS transport v5. For XPT it decodes IBM System/370 doubles and SAS missing values. It is checked against published constants (1.0 = `4110000000000000`, 0.1, −118.625).
   - `adam-rows.ts`, `adam-source-derivation.ts` and `adam-safety-domains.ts` derive the csr-source.v1 envelope, and then hold it to `CsrSourceEnvelopeSchema`:
     - ADSL gives participants, arms (TRT01P through the manifest's arm map), populations (RANDFL or a declared flag, SAFFL, ITTFL/FASFL, PPROTFL), disposition (EOSSTT/DCSREAS) and demographics.
     - ADAE gives TEAEs (TRTEMFL) by AEBODSYS/AEDECOD, with ASEV/AESEV, AESER, AREL/AEREL, AEOUT/AESDTH and AEACN.
     - ADEX gives TRTDURD.
     - ADLB gives ANRIND shifts to the last on-treatment value.
     - ADVS and ADEG give baseline and last on-treatment AVAL.
     - ADCM gives coded concomitant medications.
3. **Imported efficacy (design decision 2).** `shared/csr-adam-bundle.ts` defines the `concept2cure.csr-adam-bundle.v1` manifest and the `concept2cure.csr-efficacy-results.v1` file. The efficacy rows use the same `CsrEfficacyResultSchema` as hand-built sources, including the D5 lane's credible interval and posterior probability. They are recorded as reported, never computed.
4. **The Vault path.** `server/services/csr/adam-bundle-load.ts` is called from `vault-source-input.ts`.
   - Every dataset and the efficacy file must be the current, approved version at the digest the manifest pins. One unapproved file makes the whole source unapproved: preview says so, and a run refuses with `CSR_SOURCE_APPROVAL_REQUIRED`.
   - The receipt binds the manifest's SHA-256, which pins every component's SHA-256.
5. **Typed refusals; no subject is invented.** Each refusal is a `CsrSourceInputError` with code `CSR_ADAM_*` and a `dataset[row].VARIABLE` path. No refusal carries an uploaded value. The codes:
   - SUBJECT_NOT_IN_ADSL and SUBJECT_NOT_IN_SAFETY_POPULATION
   - ARM_UNMAPPED and TREATMENT_REASSIGNED
   - DISPOSITION_NOT_FINAL (ONGOING)
   - VALUE_UNMAPPED (for example SEX = U or AESEV = GRADE 2) and VALUE_MISSING
   - VARIABLE_MISSING
   - DATASET_MISMATCH and STUDY_MISMATCH
   - EXPOSURE_INCOMPLETE and EXPOSURE_AMBIGUOUS
   - ORDER_UNRECORDED, LAST_VALUE_AMBIGUOUS and BASELINE_AMBIGUOUS
   - EFFICACY_PROTOCOL_MISMATCH
   - BUNDLE_INVALID, DATASET_UNREADABLE and EFFICACY_INVALID
   - Red: `red-cross-dataset-check-disabled.txt`. With the typed safety-population check switched off, the bad ADAE row surfaces only as a generic contract failure. The check was restored.
   - Red: `red-ae-outcome-unrecorded.txt`. An ADAE with no AEOUT/AESDTH or no AEACN was accepted, and fatal events and AE discontinuations would have read 0. Those variables are now required.
6. **Wider table set.** The new tables are built only when supplied, so sources without them keep identical table objects:
   - `vitalSigns`, §12.5: change from baseline to the last on-treatment value, mean (SD), with n per arm.
   - `concomitantMedications`, §11.2: subjects by ATC class and medication, n (%). An uncoded class reads "ATC class not coded".
7. **Section map.**
   - §12.5 → `vitalSigns`.
   - §11.2 adds `concomitantMedications`.
   - §12 and §12.6 add `vitalSigns`.
   - §2 and §13 read every key.
   - Red: `red-section-12-5-map.txt`. Slice 1's §12.5 refusal test still holds, because a run with no vital-sign table is refused, not padded.
8. **Reach.** The contract document served at `GET /api/submission-orchestrator/csr/source-contract` now carries `adamBundle` (schemas, required and optional datasets, derivation rules). `CsrSourceInputControls.tsx` already renders that document. One sentence of copy tells the user that a bundle manifest is a valid choice. No new surface was added.

## End-to-end proof (synthetic, LMN-201-shaped)

`server/services/csr/__tests__/support/adam-lmn201-synthetic.ts` is a **synthetic** ADaM set, and every row in it is invented. It has 23 subjects randomized 12:11 (LMN-201 against placebo), one death (DCSREAS DEATH, a fatal SAE that led to withdrawal), one non-fatal SAE, a pre-treatment AE that must not be tabulated, a loss to follow-up, and ADEX, ADLB (sent as NDJSON), ADVS and ADCM. Its Bayesian figures are labelled placeholders. They are not the study's reported result.

- `adam-source-derivation.test.ts` covers:
  - every refusal above
  - the participant list equal to the ADSL subjects, with nothing added
  - the same envelope from SAS transport as from Dataset-JSON
  - every cell of §10.1: Death 0 / 1 / 1; Lost to follow-up 0 / 1 / 1; Screen failure and Other "not recorded"
  - §12.2, §12.3, §12.1, §12.4, §12.5, §11.2 and the Bayesian §11.4 columns
  - §12.5 and §12.2 evidence packs built by `buildCsrAuthoringEvidence`, where every drafted figure reconciles with `reconcileCsrTableClaims` and a wrong figure is caught (`needs_review`)
- `vault-adam-bundle.test.ts` runs the same set through the governed Vault path: eight files read, the receipt bound to the manifest, no subject identifier in the preview. It also covers refusal of an unapproved component, refusal of a component whose bytes differ from the pinned digest, and the derivation's typed refusal coming out of the Vault path.
- The public CDISC pilot ADaM set (`cdisc-org/sdtm-adam-pilot-project`) was **not reachable from this session** (HTTP 403 through the agent proxy). It is not depended on. It is the next proof, once the founder admits external data.

## Verification

- `green.txt`: 15 files and 172 tests passed. They are the new suites plus their neighbours: vault-source-input, saved-clinical-tables, csr-bayesian-result, the 500-subject lmn201 integration, csr-job-runner.evidence, unsupplied-statistics, csr-tabulation-source-correctness, the slice-1 csr-section-evidence-tool, submission-orchestrator, and the Data Room xpt-structure and dataset-json-structure suites.
- `NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .` exited 0 with no diagnostics. The first attempt timed out while another session's tsc held memory, and the retry passed.
- `npx eslint` over every changed file found no new warning. The one warning, the complexity of `buildCsrAuthoringEvidence` in `cortex-authoring-context.ts`, is present at HEAD unchanged.
- `ci:migration-set-order`, `ci:migration-drop-safety` and `ci:migration-deploy-path` all pass. This slice adds no table or migration.

## Not done in this slice (remaining)

- From the design's slice-6 list:
  - subgroup tables
  - protocol deviations
  - exposure-adjusted incidence
  - time-to-event summaries from ADTTE
  - crossover designs, which are refused by this contract
  - §14 TFL numbering
  - ADEX dose: the mean daily dose stays "—"
- **The receipt pins only the manifest.** `validateCsrSourceReceipts` re-checks only the manifest document at historical and release reads. A `remove_data` disposition on one ADaM component is not seen there. The fix is to add the component ids to the receipt (`CsrSourceReceiptSchema` in `shared/csr-source-input.ts`) and check each one.
- **The new tables cannot be mapped for review yet.** The scientific-review contract `shared/authoring/csr-scientific-review.ts` `CSR_TABLE_KEYS` belongs to the D5 lane (review). It does not list `vitalSigns` or `concomitantMedications`, so a reviewer cannot yet map a claim to those tables (fail closed). It is also a second copy of `cortex-authoring-context.ts` `CSR_TABLE_KEYS`, and the two should converge.
- **Hand-built sources keep the same defect in §12.3.** A source whose AEs carry no `outcome` or `ledToDiscontinuation` still prints `0` fatal events and `0` AE discontinuations. The ADaM path now refuses such an ADAE.
- **The PUNCH CD3 transcription** from slice 1 (`docs/evidence/D2-EDITOR-CSR-CRF/2026-10-29-ana-evidence/punch-cd3-reconcile.ts`) uses only completed, discontinued and other. When it is re-run, its §10.1 rows for Screen failure, Lost to follow-up and Death read "not recorded" instead of `0`, and that table's pack digest (`8a7c4ea7…` in its reconciliation JSON) changes. This is the defect fix. To print "Completed study" the transcription should declare `dispositionBasis: 'end-of-study'`. Slice 1's filed JSON was not regenerated here.

## Adversarial review (2026-10-29)

Two defects were found after the builder's report and were fixed red first. The red run is in `red-review-ae-row-unrecorded-and-discontinued-label.txt`.

1. **A row-level unrecorded AE value was counted as 0.** The builder required the AEOUT or AESDTH column and the AEACN column, but not their values. On a treatment-emergent row, a blank AESDTH with a blank or `UNKNOWN` AEOUT made the event non-fatal, and a blank or `UNKNOWN` AEACN made it "not discontinued". §12.2 and §12.3 then printed an unrecorded value as 0. Both cases are now refused as `CSR_ADAM_VALUE_MISSING` at `ADAE[n].AESDTH` or `ADAE[n].AEACN` (`outcomeOf` and `discontinuationOf` in `adam-source-derivation.ts`). AESDTH = N with no AEOUT is still accepted, because it records that the event was not fatal.
2. **The §10.1 label "Discontinued (any reason)" was wrong for the derived source.** In the synthetic run three subjects discontinued, but the row read 1 / 0 / 1, because death and loss to follow-up have rows of their own. A source that declares `dispositionBasis` now labels the row "Discontinued (other reasons)". A source that declares no basis keeps its previous label and bytes.

Known gaps, as the section above already records:
- The receipt pins only the manifest, so a disposition on one ADaM component is not seen at release reads.
- The new tables cannot yet be mapped for D5 scientific review.
- Hand-built sources still print 0 for an AE outcome they do not record.
