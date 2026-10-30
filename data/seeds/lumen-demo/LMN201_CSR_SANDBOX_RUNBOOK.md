# LMN-201-like CSR sandbox journey — DEMONSTRATION ONLY

**Not an actual Lumen Bioscience customer, clinical trial record, user account, or sponsor authorization.**
This runbook supplements the existing Lumen demo seed; it does **not** use its Brian Finrow account or invite real Lumen personnel.

## Requested sandbox identities
- Proposed owner: **Jon-Michael Smith**, existing authorized Concept2Cure account (resolve by login; never invent an email or user ID).
- Proposed client display: **Lumen Bioscience — DEMO / NOT AFFILIATED**.
- Proposed project: **LMN-201-like Part B CSR — SYNTHETIC**.
- Project type: biotech/pharma, CSR, U.S. FDA, ICH E3; sandbox/test only.
- No client-admin license for a real Lumen employee. No production client record without confirmation and proper tenant authorization.

## Fixture
`seed-data/lmn201_synthetic_csr_source_v1.json` conforms to the existing `concept2cure.csr-source.v1` structure. It represents **23 invented randomized participants**, 12 in an illustrative LMN-201 arm and 11 in control, with synthetic primary endpoint displays of 10/12 and 4/11. Every participant, demographic, adverse event and disposition is fictional. Public discussion of 45 total participants is context, **not** represented by these 23 invented observations.

Do not infer adjusted odds ratios, Bayesian posterior probabilities, confidence/credible intervals, p-values, causal effects, or real safety conclusions. This is not a reproduction of Lumen's protocol, SAP, source data or CSR.

## Run using existing product workflow
1. In an authorized non-production organization, resolve the current user's actual ID and create a demo-only client/project through existing tenant/project controls. Never reuse the live company's slug `lumen-bioscience` or modify an actual customer.
2. Upload and retain the JSON as an immutable original in that project's Vault/data room. Record the returned document UUID, version and SHA-256. Do not create a fabricated approval receipt.
3. Use the existing CSR source selection and validator; select the exact uploaded document version and hash, and obtain the required governed approval.
4. Generate deterministic tables from the selected source. Reconcile every population and endpoint display to the 23 source rows.
5. Ask AnA in the **existing canvas/editor** to draft ICH E3 sections. The entire document must be marked **SYNTHETIC DEMO — NOT CLINICAL EVIDENCE**. Unknown protocol/SAP, statistical model and real safety conclusions remain explicit.
6. Exercise review findings, version history, source withdrawal, cancellation/retry, DOCX export and reopen. Capture real run IDs and model output hashes for CSR benchmarks.
7. Retain original source, generated sections, output documents, approvals, review logs and export artifacts; do not delete evidence.
8. Record screenshots, API responses and CI results only when observed; never treat a GitHub fixture as proof of a live tenant.

## Required acceptance results
- Authorized owner/project scope and tenant isolation demonstrated.
- Original retained; exact source version selected; source contract passes.
- All generated denominators and counts reconcile; unsupported model statistics never appear.
- Source withdrawal blocks downstream approval; cancelled worker cannot revive the job.
- Governed DOCX retains E3 headings, tables, provenance, and DEMO status.
- Real AnA model outputs undergo qualified human review; no self-scored pass.

## Current execution boundary
The fixture and regression tests are committed to `concept2cure-v2`. No live account, tenant, project, Vault upload, AnA model run, or deployed test is represented as complete by this runbook. Browser control in this chat requires an originating connected browser context.
