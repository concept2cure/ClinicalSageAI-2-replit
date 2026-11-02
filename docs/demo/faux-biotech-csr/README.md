# Faux Biotech CSR demonstration — synthetic revision 2

**Current data: revision 2. Hosted provisioning and ingestion: NOT PERFORMED.**
This package is entirely fictional. It is not clinical evidence, a completed CSR,
a regulatory submission, or proof of a working hosted demonstration.

## Current files

- `FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz` retains the complete structured source
  in GitHub. Decompress it and upload the resulting `.json` through the existing
  Vault UI. Do not upload the gzip file as if it were supported clinical-source JSON.
- `ADSL_160_SUBJECT_QC_INDEX.csv` is the corrected 160-row index; placebo identities
  are the original **FBT201-P001–P080**, not the earlier erroneous B-series IDs.
- `TLF_PRIMARY_EFFICACY.csv` and `ANALYSIS_SUMMARY.json` carry revision-2 completion
  totals. Efficacy and safety aggregate counts are unchanged.
- The delivered `Faux_Biotech_CSR_Demo_Revision_2.zip` contains the uncompressed
  JSON, revised ADSL, unchanged ADEFF/ADAE/ADLB, protocol/SAP, updated TLF/CSR draft,
  traceability, proposed tasks, correction log and preserved original archive.

## Correction of the earlier package

Three original synthetic records had both AEWITH=Y and COMPLTRT=Y:
FBT201-A003, FBT201-A067 and FBT201-P006. Revision 2 changes only their treatment
completion flags to N, explicitly uses end-of-treatment disposition, and updates
the associated participant/disposition records and totals. No real clinical
source is changed. The original source bytes remain in the handoff archive.

| Measure | FBT-201 200 mg | Placebo |
|---|---:|---:|
| Randomized / ITT / safety | 80 | 80 |
| Week 12 PASI75 responders | 52 (65.0%) | 30 (37.5%) |
| Treatment completed — revision 2 | 74 | 76 |
| Subjects with TEAE | 42 | 37 |
| Subjects with SAE | 3 | 2 |
| AE-related treatment withdrawals | 2 | 1 |

Earlier dated reconciliation notes and the original 76/77 completion totals are
**historical, not the current import source**. Their checksum checks did not prove
cross-record consistency. The earlier QC index's placebo IDs were incorrect.
Do not mix the revision-2 source with an original completion table or draft.

## Existing application path, not another demo system

Use the existing organization and client-workspace workflow to provision
**Faux Biotech Therapeutics (fictional demonstration)** and the Clinical Development /
CSR Demonstration workspace. The proposed projects remain FBT-102 (nonclinical/IND
planning), FBT-201 (Phase 2 CSR), and FBT-202 (Phase 3 planning). Only FBT-201 has
synthetic outcome data. These names are proposals, not created application IDs.

In that same authenticated tenant, upload the JSON and original source documents,
retain actual returned IDs/hashes, complete authorized source review, select the
existing CSR component template, preview/freeze its study data, and then draft in
the existing editor. Preserve unknown exposure, lab-range classification, vital
signs, source approval and provider/model readiness as unresolved where applicable.
A saved JSON file does not create a Vault document, clinical table, CSR build,
review task, signature or filing. No NCT number or agency identifier is invented.

## Verification scope

`node --test tests/ops/csr-demo-source-consistency.test.mjs` executes the actual
source file's cross-record refinement functions. **21 passed; the original
validator failed four of these cases.** It does not execute Zod's field parsers.
The extended native-schema suite is
`shared/__tests__/csr-source-input.test.ts`; it has not run in this executor.
Native schema acceptance, PGlite, full TypeScript/build and hosted/browser acceptance
remain open. Evidence: `docs/evidence/D2-CSR/2026-11-02-faux-source-reconciliation/`.

The new consistency gate applies only to explicitly end-of-treatment disposition.
A subject can stop treatment and still complete study follow-up; end-of-study and
unspecified disposition are not reinterpreted as treatment completion.

## Live acceptance remains unexecuted

Verify the actual demo identity and tenant, create/reopen the projects, ingest and
reopen source records, preview and freeze tables, draft/save/reopen the CSR, open
its reviewer task and exact document, complete review through actual authorized
controls, and verify each advertised navigation destination. Do not represent
proposed CSV tasks or example narrative as executed reviews or real signatures.
