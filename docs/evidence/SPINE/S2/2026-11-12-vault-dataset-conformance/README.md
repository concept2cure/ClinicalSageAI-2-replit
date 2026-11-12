# A dataset filed in the Vault is graded for CDISC conformance, 2026-11-12 (GA)

The founder's own example of the data catalog is a CSR project and its study data. The CDISC pilot's analysis
datasets are filed in that project's Vault. In the Data catalog each read "Conformance 0/15: a dataset whose
structure has not been read here": the one criterion that says anything about clinical data was never applied to it.

## What already exists (RULE 3)

| Path | What it does | What it did not |
|---|---|---|
| `server/services/clinical-regulatory-evidence/dataset-profile.ts` | Profiles a dataset's bytes: tables, columns, the CDISC standard the columns show. Reads `.xpt`, Dataset-JSON, define.xml, CSV, TSV, XLSX | Ran only when a file was captured in the data room; did not recognise ADaM occurrence data (ADAE) |
| `server/services/clinical-regulatory-evidence/data-room-grade.ts` | The grade; its conformance criterion runs `cdisc-conformance-service.ts` over a profile | Validated an ADaM table under the class its columns show, not its name; validated a define file's described datasets with no variables |
| `server/services/cdisc/cdisc-conformance-service.ts` | The SDTM and ADaM structural validators (the engines behind AnA's validate tools) | Unchanged |
| `server/routes/c2c/project-vault.ts` (`readVerifiedVaultBytes`) | Reads a Vault document's bytes and checks them against the recorded SHA-256 | Unchanged |
| `vault.document_catalog` | The Vault's derived record of what a document's content is, by document and content hash | Had nowhere to keep a dataset profile |

Nothing new: no screen, route, table, engine or AnA tool. Two nullable columns on an existing table.

## What changed

1. **A Vault dataset is profiled once** (`data-room-vault.ts`). When the catalog lists a Vault document that is a
   dataset format, has a catalog record and no profile, it reads the bytes through the Vault's verified read, profiles
   them and stores the profile on the catalog record of that content (`migrations/20261112_vault_catalog_dataset_profile.sql`:
   `dataset_profile`, `dataset_profiled_at`). At most two per read and 128 MB a file, so a page of new datasets fills
   in over a few reads. Bytes that are not a dataset are remembered as such and read once. A failed read leaves the
   document listed with "its structure has not been read here".
2. **Found by doing it: the grade validated ADaM datasets under the wrong name.** The profile's `domain` for ADaM is
   the class ("BDS"); the validator wants a dataset name, so every analysis dataset answered UNKNOWN_DATASET and
   failed, the CDISC pilot's own ADVS included. This was so for captured datasets since 2026-11-06. An ADaM table is
   now validated under its own name. The validator lists thirteen names and the ADaM guide lets a sponsor name an
   analysis dataset (ADLBC, ADQSADAS): for a table whose columns show an ADaM class and whose name follows the ADaM
   naming rule, that one finding is not counted; every other finding is.
3. **ADaM occurrence data is recognised** (`detectCdisc`): a subject, an analysis treatment and the event's term,
   with no SDTM DOMAIN column. The pilot's ADAE was "no CDISC standard recognized".
4. **A define file is not validated as data.** It describes datasets and lists none of their variables, so every
   required variable read as missing ("ADSL: 10 errors"). It now says what it is and conformance does not apply.

## Before and after, the CDISC pilot CSR project's Vault, as the catalog answers it

| File | Before | After |
|---|---|---|
| advs.xpt, adlbc.xpt, adlbh.xpt | C 70, structure not read | **B 85**, 1 of 1 table passes the ADaM validator |
| adae.xpt | C 70, structure not read | **B 85**, passes (was "no standard recognized" once profiled) |
| adsl.xpt | C 70, structure not read | C 70, **ADSL: 1 error** (the validator requires ACTARM, which the pilot's ADSL does not carry) |
| define.xml | C 70 | B 82, describes 10 datasets; conformance checked on the datasets |
| cdiscpilot01-adam-bundle.json | B 82 | B 82, not a dataset |

The remaining points each of these lacks are the same two for every file: fixity not yet checked, and no person has
confirmed its catalog record. Both are acts in the Vault.

## Checks

- `data-room-vault.test.ts` (4 new): profiled once from verified bytes and stored; no bytes read when profiled, not
  a dataset format, uncataloged or too large; two per read and a failed read stays "not read"; non-dataset bytes
  remembered.
- `data-room-grade.test.ts` (2 new): ADaM under its own name, a sponsor-named dataset, another finding still counts,
  a non-ADaM name still fails; a define file is not validated.
- `dataset-profile.test.ts` (1 new): ADAE recognised; an SDTM AE domain is still SDTM.
- `server/services/clinical-regulatory-evidence`, the sources route, AnA's catalog tool, `scripts/db`: 66 files,
  1,034 cases. Typecheck 0. Migration gates (drop-safety, set-order, reachability, guard-order, deploy-path,
  prefix-collisions) and `ci:sql-interpolation` pass. The catalog walk of 2026-11-11 re-run: every step passes.

## Not done

- A dataset larger than 128 MB is not profiled. The CSR pipeline reads such files its own way.
- The validator is the structural subset it says it is. Its ADSL rule (ACTARM required) and its list of thirteen
  dataset names belong to `server/services/cdisc/`, not this lane.
- The Vault lane was told before this landed (through the lead session). If it would rather make the profile at
  ingest, the catalog only needs to read the column.
