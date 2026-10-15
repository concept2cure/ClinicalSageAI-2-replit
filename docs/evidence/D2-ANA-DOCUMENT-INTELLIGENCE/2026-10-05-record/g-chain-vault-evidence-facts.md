# g-chain-vault-evidence — facts relied on

Step: the database-lock plan (`plan_submission_from_database_lock`) reads the Vault's own filing vocabulary.
Verified finding: `verified-all.json` item 34 (`chain-vault-evidence-matching`), corrected proposal.

## Regulator facts

| # | Fact | Basis | Source | Checked |
|---|------|-------|--------|---------|
| 1 | In an eCTD the ISS and ISE go in Module 5, section 5.3.5.3. | regulator-text (constant `FDA_ISS_ISE_PLACEMENT`, already in `server/services/ind/ctd/regulatory-basis.ts`) | https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/placement-integrated-summaries-safety-and-effectiveness-issise-applications-submitted-ectd-format | 2026-10-05 (search result quoting the page; fda.gov cannot be fetched from this environment) |
| 2 | If the narrative portions of the ISE and ISS are suitable for 2.7.3 and 2.7.4, they are placed once in those sections and referenced from 5.3.5.3 by leaf elements there. So an ISS/ISE at 2.7.3 or 2.7.4 is **not** misfiled. The evaluation records a placement note that a 5.3.5.3 leaf is still needed. | regulator-text | same page | 2026-10-05 |
| 3 | The Module 2 CTD summaries are not where the 21 CFR 314.50 ISS/ISE go; those are detailed integrated analyses that belong in Module 5. | regulator-text | same page | 2026-10-05 |
| 4 | 2.7.3 is the Summary of Clinical Efficacy and 2.7.4 the Summary of Clinical Safety (Module 2). A document with those titles in Module 5 is misfiled. | regulator-text (constant `M4E_R2`, ICH M4E(R2) as FDA publishes it, checked 2026-10-04 by g-basis-constants-one-home) | https://www.fda.gov/media/93569/download | 2026-10-04 |
| 5 | CSRs are filed under 5.3.5.1 (controlled), 5.3.5.2 (uncontrolled) or 5.3.5.4 (other study reports) by study type, and under 5.3.1–5.3.4 for biopharmaceutic, PK and PD studies. | **recall** (ICH M4E heading structure), not checked against regulator text in this step | — | — |
| 6 | A placement at the heading 5.3.5 does not cover 5.3.5.1, .2 or .4. | **platform convention**: `server/services/vault/vault-coverage.ts` header ("5.3.5 does not cover 5.3.5.1"). The verifier found that the claim "5.3.5 is not an eCTD leaf heading" rests on recall only, so it is not stated as regulator text. | — | — |

Search used (WebSearch, allowed_domains fda.gov, 2026-10-05): "FDA placement of integrated summaries of safety and effectiveness ISS ISE eCTD 5.3.5.3 2.7.3 2.7.4 narrative". The top result is the FDA page above. The result text quotes facts 1–3.

A narrower reading of fact 2 is possible: ISE narrative to 2.7.3 only, ISS narrative to 2.7.4 only. The page names the two sections together and does not say "respectively". This step does not adopt the narrower reading. It follows the step and the verifier: either Module 2 section is accepted.

## Platform facts (read from the code at HEAD a9ac124a)

- `vault.documents.folder_id` and `vault.documents.evidence_kind` exist (`migrations/20260823_vault_document_placement.sql:49-50`). No migration is needed.
- When an upload is declared as a CSR, it is stored as `{evidence_kind:'csr', folder_id:'module-5', ctd_section:NULL}` (`vault-filing.service.ts` DECLARED_TYPE `CSR: { kind: 'csr', module: 5 }`, reconcileDeclaredType). Before this change `readVaultFacts` required `ctd_section IS NOT NULL`, so it dropped every such row.
- The Vault text rules propose a CSR body at `5.3.5` with kind `csr`, and a SAP body at `5.3.5` with kind `protocol` (`vault-filing.service.ts:191,193`). The name classifier puts efficacy/CSR names at `5.3.5` (`ctd-ingestion-service.ts`).
- The Vault evidence-kind vocabulary is `VaultDocKind` (`shared/constants/domain/vault-taxonomy.ts`). `'csr'` is the one kind used here.

## Decisions made in this step

- A CSR-identified row exactly at `5.3.5`, or in folder `module-5` with no section, counts as **suggested**, never filed, whatever its placement status. It is listed under `unspecificPlacement` / `unspecific_placement`. A confirmed CSR at a leaf takes precedence.
- CSR identity is `evidence_kind = 'csr'` OR a title that names a CSR (`clinical study report`, or `CSR` bounded by non-alphanumerics, so `ABC-301_CSR.pdf` is read). A row is not a CSR if its title names a SAP, an integrated summary or a Module 2 summary. A title naming a protocol also excludes the row, **unless the title also names a CSR**: CSRs are routinely titled by protocol number ("Clinical Study Report — Protocol ABC-301"), and excluding those would report a filed CSR as missing.
- `sap_final` does not count a row whose `evidence_kind` is `csr`.
- Misfiling is reported from titles only, for the steps that carry a `misfiledPattern`: m2_7_3, m2_7_4, iss and ise. Evidence semantics for m2_7_3 and m2_7_4 are unchanged: any document at 2.7.3 or 2.7.4 still counts.
- The standing lists at most 3 lines per placement list (`and N more`), with titles cut at 60 characters, so the result stays within `RESULT_BUDGET` (5000). This is pinned by a test with 20 rows in each list.
- Persisted rows are not rewritten (DECISIONS.md #6, "detect and surface; never rewrite silently").
