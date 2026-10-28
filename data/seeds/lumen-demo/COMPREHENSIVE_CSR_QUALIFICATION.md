# LMN-201-like CSR comprehensive synthetic qualification

**DEMONSTRATION ONLY. NOT ACTUAL LUMEN BIOSCIENCE DATA, A REAL CLIENT, OR CLINICAL EVIDENCE.**

The original 23-subject source fixture is retained unchanged for small regression tests. A separate deterministic generator now creates a 500-subject dataset and 25 SDTM/ADaM-*like* tabular domain CSVs, a source JSON compatible in field shape with `concept2cure.csr-source.v1`, a source checksum manifest, and 120 negative-test *instructions*. No data are drawn from actual Lumen participants.

## Generation
```sh
node data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.mjs
node --test data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.test.mjs
```
Outputs are written under `data/seeds/lumen-demo/generated-comprehensive/` (or the caller's selected output path). The script does not connect to a database or overwrite the existing small fixture.

## Coverage and deliberate limits
The generator produces two 250-subject arms, illustrative 190/250 and 140/250 global-cure counts, fictional adverse events, and 25 domain-style CSVs: DM, DS, MH, CM, EX, VS, EG, LB, MB, QS, FA, SV, DV, SU, PR, PC, PP, RS, ADSL, ADEFF, ADAE, ADLB, ADVS, ADTTE, and AE. These are **not** certified SDTM/ADaM datasets and should never be labeled CDISC-compliant without separate metadata, controlled terminology, conformance and statistical validation. The 120 negative cases are separate mutation instructions, not contaminated clean source data; their checks have not been executed.

This fixture is designed to exercise input and narrative reconciliation. It does **not** establish a true Bayesian analysis, real SAP-defined estimands, blinded randomization, authentic PK parameters, valid clinical adjudication, data-management query history, actual protocol amendments, or complete ICH E3 report qualification. Those need additional governed synthetic source documents and validated analysis receipts. No unsupported odds ratio, credible interval, p-value, or treatment-effect conclusion is generated.

## Live sandbox plan
1. Create a clearly marked **synthetic, non-affiliated demo project** under the existing authorized Concept2Cure account. Do not impersonate Lumen staff.
2. Upload and retain original generated source JSON and domain CSVs in the existing Vault. Record exact source hashes and versions.
3. Run the current `CsrSourceEnvelopeSchema` validator and document selection/approval controls. The generator's local checks do not replace that validator.
4. Use existing biostatistics and deterministic TLF services to reconcile populations, endpoints and safety counts. No unsupported model-derived statistics.
5. Draft the CSR with AnA in the **same canvas/editor**. Require explicit SYNTHETIC labeling, source anchors and missing-data disclosures.
6. Run source withdrawal, changed-data-cut, partial OCR, permission, cancellation, approval, export/reopen and negative-data tests.
7. Retain originals, generated outputs, source receipts, model responses, review findings and test evidence.
8. Record actual deployment and browser results. **No live project, Vault upload, AnA run, or end-to-end pass is claimed by this seed.**

## Release criteria
Require passing generator tests, source-contract validation, statistical/TLF reconciliation, 120 negative-case executions, full application CI, tenant-isolation checks, medical-writer and biostatistician review, governed DOCX fidelity, and a real deployed golden journey. No single recurrent-CDI fixture can establish all-modality CSR coverage.
